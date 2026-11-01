import { describe, it, expect, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, uniqueChannel, settle } from "../__fixtures__/storages.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";

// ------------------------------------------------------------------------------------------------
// The life of an adapter:
//   - IndexedDB never waits for good. Up to 1.3.0 a database without the adapter's object store (the same dbName
//     opened with another storeName — startStoragefy and the class have different defaults) threw inside the open and
//     every use waited forever; a tab holding an older version open blocked a newer one for good.
//   - destroy() releases everything (up to 1.3.0 it only stopped the expiry watcher: the channel and the IndexedDB
//     connection stayed open), after the writes already asked.
//   - destroyAll() stops keeping every store of a store adapter.
// ------------------------------------------------------------------------------------------------

afterEach(async () => {
  vi.restoreAllMocks();
  globalThis.storagefyDebug = false;
  globalThis.storagefyDebugLevel = 0;
  await closeAll();
});

/** The cause of the failure a read reports */
async function readFailure(adapter, key) {
  const errors = [];
  expect(await adapter.get(key, { onError: (error) => errors.push(error) })).toBeNull();
  return errors.map((error) => error.cause?.message);
}

/** Opens a database the way another tab does — and keeps it open */
function openRaw(dbName, version) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe("IndexedDB — opening", () => {
  it("refuses a database without its object store, with the reason, instead of waiting for good", async () => {
    freshStorage("IndexedDBAdapter");
    await openStorage("IndexedDBAdapter", { dbName: "app", storeName: "storagefy_db" }).set("theme", "dark");
    const other = openStorage("IndexedDBAdapter", { dbName: "app" });

    expect(await other.set("theme", "light")).toBe(false);
    expect(await readFailure(other, "theme")).toEqual([
      'Storagefy: the IndexedDB database "app" (version 1) has no object store "app_store" — open it with the ' +
        "storeName it was created with, or raise version to create it",
    ]);
  });

  it("creates the object store when the version is raised", async () => {
    freshStorage("IndexedDBAdapter");
    const first = openStorage("IndexedDBAdapter", { dbName: "app", storeName: "storagefy_db" });
    await first.set("theme", "dark");
    await first.destroy();

    const raised = openStorage("IndexedDBAdapter", { dbName: "app", version: 2 });
    expect(await raised.set("theme", "light")).toBe(true);
    expect(await raised.get("theme")).toBe("light");
  });

  it("an older version open in another tab is closed: the newer version opens, the older one fails with the reason", async () => {
    freshStorage("IndexedDBAdapter");
    const older = openStorage("IndexedDBAdapter", { dbName: "app" });
    await older.set("theme", "dark");

    const newer = openStorage("IndexedDBAdapter", { dbName: "app", version: 2 });
    expect(await newer.get("theme")).toBe("dark");

    expect(older.isReady).toBe(false);
    expect(await older.set("theme", "light")).toBe(false);
    expect(await readFailure(older, "theme")).toEqual([
      'Storagefy: the IndexedDB database "app" was upgraded by another tab — reload the page',
    ]);
  });

  it("waits, with a warning, for a tab that does not close its older version — then opens", async () => {
    freshStorage("IndexedDBAdapter");
    globalThis.storagefyDebug = true;
    globalThis.storagefyDebugLevel = 1;
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
    const raw = await openRaw("app", 1);

    const newer = openStorage("IndexedDBAdapter", { dbName: "app", version: 2 });
    const written = newer.set("theme", "dark");
    await settle();
    expect(warnings.mock.calls.flat()).toContain(
      'IndexedDB "app" (version 2) waits for the other tabs to close an older version',
    );

    raw.close();
    expect(await written).toBe(true);
  });
});

describe.each(STORAGE_NAMES)("%s — destroy", (name) => {
  it("waits for the writes already asked", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });

    void adapter.set("theme", "dark");
    await adapter.destroy();

    if (name === "IndexedDBAdapter") {
      expect(await openStorage(name, { encrypt: true, password: "app-secret" }).get("theme")).toBe("dark");
    } else {
      expect(await adapter.get("theme")).toBe("dark");
    }
  });

  it("stops the expiry watcher and closes the channel — nothing is told nor heard after it", async () => {
    freshStorage(name);
    const channelName = uniqueChannel();
    const adapter = openStorage(name, { channelName, enableSyncTabs: true, expireCheckInterval: 1000 });
    const closed = vi.spyOn(adapter.channel, "close");

    await adapter.destroy();

    expect(adapter._expireTimer).toBeNull();
    expect(closed).toHaveBeenCalledOnce();
    expect([adapter.channel, adapter.channelName]).toEqual([null, null]);
    const heard = vi.fn();
    adapter.onDataChanged(heard)();
    await openStorage(name, { channelName, enableSyncTabs: true }).set("theme", "dark");
    await settle();
    expect(heard).not.toHaveBeenCalled();
  });

  it("may be called twice", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.destroy();
    await expect(adapter.destroy()).resolves.toBeUndefined();
  });
});

describe("IndexedDB — destroy", () => {
  it("closes the connection: a use after it fails with the reason", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter", { dbName: "app" });
    await adapter.set("theme", "dark");

    await adapter.destroy();

    expect(adapter.isReady).toBe(false);
    expect(await adapter.set("theme", "light")).toBe(false);
    expect(await readFailure(adapter, "theme")).toEqual(['Storagefy: the IndexedDB adapter of "app" was destroyed']);
  });

  it("of a database that never opened, ends without error", async () => {
    freshStorage("IndexedDBAdapter");
    await openStorage("IndexedDBAdapter", { dbName: "app", storeName: "storagefy_db" }).set("theme", "dark");
    const refused = openStorage("IndexedDBAdapter", { dbName: "app" });

    await expect(refused.destroy()).resolves.toBeUndefined();
  });
});

describe("StoreAdapter — destroyAll", () => {
  it("stops keeping every store; what is stored stays, the storage adapter goes on", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const pinia = createPinia();
    const cart = defineStore("cart", { state: () => ({ items: 1 }) })(pinia);
    const theme = defineStore("theme", { state: () => ({ dark: false }) })(pinia);
    const adapter = new PiniaAdapter(storage);
    await adapter.setInStorage(cart, "cart");
    await adapter.setInStorage(theme, "theme");

    adapter.destroyAll();
    cart.$patch({ items: 2 });
    theme.$patch({ dark: true });
    await settle();

    expect(adapter.stores).toEqual({});
    expect([await storage.get("cart"), await storage.get("theme")]).toEqual([{ items: 1 }, { dark: false }]);
    expect(await storage.set("other", 1)).toBe(true);
  });
});
