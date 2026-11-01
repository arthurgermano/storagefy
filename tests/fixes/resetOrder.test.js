import { describe, it, expect, afterEach, vi } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, uniqueChannel } from "../__fixtures__/storages.js";

// ------------------------------------------------------------------------------------------------
// reset() and clear() take their turn among the writes: they run after every write asked before them, and the writes
// asked after them wait for them. Up to the first 1.3.0 build a write asked before a reset (and not awaited) landed
// after it and survived it. reset() also removes the expirations of the keys it removes: they were left behind, and
// the expiry watcher later told the other tabs about removing keys that were gone.
// ------------------------------------------------------------------------------------------------

afterEach(async () => {
  vi.restoreAllMocks();
  await closeAll();
});

const CASES = STORAGE_NAMES.flatMap((name) => [
  [name, "plain", {}],
  [name, "encrypted", { encrypt: true, password: "app-secret" }],
]);

describe.each(CASES)("%s (%s) — reset and clear among the writes", (name, _case, options) => {
  it.each(["reset", "clear"])("a write asked before %s() is removed by it", async (operation) => {
    freshStorage(name);
    const adapter = openStorage(name, options);

    void adapter.set("cart", { items: 1 }, 60_000);
    await adapter[operation]();

    expect(await adapter.get("cart")).toBeNull();
    expect(await adapter.getExpire("cart")).toBeNull();
  });

  it.each(["reset", "clear"])("a write asked after %s() stays", async (operation) => {
    freshStorage(name);
    const adapter = openStorage(name, options);
    await adapter.set("cart", { items: 1 });

    const done = adapter[operation]();
    const written = adapter.set("cart", { items: 2 }, 60_000);

    await done;
    expect(await written).toBe(true);
    expect(await adapter.get("cart")).toEqual({ items: 2 });
    expect(await adapter.getExpire("cart")).toBeGreaterThan(Date.now());
  });

  it("a read asked after reset() sees it", async () => {
    freshStorage(name);
    const adapter = openStorage(name, options);
    await adapter.set("cart", { items: 1 });

    void adapter.reset();

    expect(await adapter.get("cart")).toBeNull();
    expect(await adapter.has("cart")).toBe(false);
  });
});

describe.each(STORAGE_NAMES)("%s — reset and the expirations", (name) => {
  it("removes the expirations of the keys it removes — the watcher tells nothing after it", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { channelName: uniqueChannel(), enableSyncTabs: true });
    await adapter.set("cart", { items: 1 }, 60_000);
    await adapter.setExpire("session", Date.now() - 1);

    await adapter.reset();
    const told = vi.spyOn(adapter, "emitDataChange");
    await adapter.clearExpire();

    expect([await adapter.getExpire("cart"), await adapter.getExpire("session")]).toEqual([null, null]);
    expect(told).not.toHaveBeenCalled();
  });

  it("keeps the metadata; clear() removes it", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    const meta = async () =>
      name === "IndexedDBAdapter"
        ? adapter._withStore("readonly", (store) => adapter._answerOf(store.get(adapter.metaKey)))
        : adapter._storage.getItem(adapter.metaKey);
    await adapter.dbPromise;
    await adapter.set("cart", 1);

    await adapter.reset();
    expect(await meta()).toBeTruthy();

    await adapter.clear();
    expect(await meta()).toBeFalsy();
  });
});

describe.each(STORAGE_NAMES)("%s — a reset that fails", (name) => {
  it("is logged, never thrown — and the writes after it still run", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    if (name === "IndexedDBAdapter") {
      vi.spyOn(adapter, "_withStore").mockRejectedValueOnce(new Error("storage gone"));
    } else {
      vi.spyOn(adapter, "_ownKey").mockImplementationOnce(() => {
        throw new Error("storage gone");
      });
    }
    await adapter.set("cart", 1);

    await expect(adapter.reset()).resolves.toBeUndefined();
    expect(await adapter.set("cart", 2)).toBe(true);
    expect(await adapter.get("cart")).toBe(2);
  });
});
