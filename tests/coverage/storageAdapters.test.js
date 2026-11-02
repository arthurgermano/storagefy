import { describe, it, expect, afterEach, vi } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, uniqueChannel, settle } from "../__fixtures__/storages.js";
import StorageAdapter from "../../src/adapters/StorageAdapter.js";

// ------------------------------------------------------------------------------------------------
// The storage adapters' remaining paths: errors of the storage itself (each method logs and answers as documented,
// never throws), expired keys, encrypted key names, the channel when there is none, the expiry watcher.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  closeAll();
});

describe.each(STORAGE_NAMES)("%s — paths of every adapter", (name) => {
  it("an expired key reads as null and is removed", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 }, 20);
    await new Promise((resolve) => setTimeout(resolve, 40));

    expect(await adapter.get("cart")).toBeNull();
    expect(await adapter.has("cart")).toBe(false);
  });

  it("an expiration of 0 or less removes the key", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 });
    expect(await adapter.set("cart", { items: 2 }, 0)).toBeNull();
    expect(await adapter.get("cart")).toBeNull();
  });

  it("refuses a write without key nor value", async () => {
    freshStorage(name);
    expect(await openStorage(name).set("", null)).toBe(false);
  });

  it("lists, resets and clears encrypted keys (their names are obfuscated)", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, channelName: uniqueChannel(), enableSyncTabs: true });
    const told = vi.spyOn(adapter, "emitDataChange");
    await adapter.set("users__1", { name: "Ana" });
    await adapter.set("products__1", { name: "Mouse" });

    expect(await adapter.getAll("users")).toEqual([{ key: "users__1", value: { name: "Ana" } }]);
    await adapter.reset();
    expect(told).toHaveBeenCalledWith("users__1", undefined, "reset");
    expect(await adapter.list()).toEqual([]);
    await adapter.clear();
    expect(await adapter.list()).toEqual([]);
  });

  it("sets, reads and removes an expiration by hand — and clears expired keys", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("a", 1);
    await adapter.set("b", 2);
    await adapter.setExpire("a", Date.now() - 1);
    await adapter.setExpire("b", Date.now() + 60_000);
    await adapter.deleteExpire("b");

    await adapter.clearExpire();

    expect(await adapter.get("a")).toBeNull();
    expect(await adapter.get("b")).toBe(2);
    expect(await adapter.getExpire("b")).toBeNull();
  });

  it("the expiry watcher removes expired keys, and destroy stops it", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { expireCheckInterval: 10 });
    const sweeps = vi.spyOn(adapter, "clearExpire");
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(sweeps).toHaveBeenCalled();

    adapter.destroy();
    const after = sweeps.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 35));
    expect(sweeps.mock.calls.length).toBe(after);
  });

  it("without a channel, tells nothing and listens to nothing", () => {
    freshStorage(name);
    const adapter = openStorage(name);
    expect(() => adapter.emitDataChange("cart", undefined, "set")).not.toThrow();
    expect(adapter.onDataChanged(() => {})()).toBeUndefined();
  });

  it("with a channel, needs an origin to tell, and a function to listen", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { channelName: uniqueChannel() });
    const emit = vi.spyOn(adapter.channel, "emit");
    adapter.emitDataChange("cart", undefined, "");
    expect(emit).not.toHaveBeenCalled();
    expect(adapter.onDataChanged("not a function")()).toBeUndefined();
  });

  it("getExpire answers null when the expirations cannot be read", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    vi.spyOn(adapter, "_loadExpires").mockRejectedValue(new Error("storage gone"));
    expect(await adapter.getExpire("cart")).toBeNull();
  });
});

describe.each([
  ["LocalStorageAdapter", () => globalThis.localStorage],
  ["SessionStorageAdapter", () => globalThis.sessionStorage],
])("%s — when the storage itself fails", (name, storage) => {
  const failing = (method) => vi.spyOn(storage(), method).mockImplementation(() => {
    throw new Error("storage failed");
  });

  it("opens even when the metadata cannot be written", () => {
    freshStorage(name);
    failing("setItem");
    expect(() => openStorage(name)).not.toThrow();
  });

  it("reads a broken expirations record as none", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", 1);
    storage().setItem(adapter.expireKey, "{ broken");
    expect(await adapter.get("cart")).toBe(1);
  });

  it("answers false when the storage is full", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    failing("setItem");
    expect(await adapter.set("cart", 1)).toBe(false);
  });

  it("logs and goes on when a key cannot be removed", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", 1);
    failing("removeItem");
    await expect(adapter.delete("cart")).resolves.toBeUndefined();
    await expect(adapter.reset()).resolves.toBeUndefined();
    await expect(adapter.clear()).resolves.toBeUndefined();
  });

  it("logs and goes on when it cannot be read or written by the expiration methods", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    failing("getItem");
    expect(await adapter.has("cart")).toBe(false);
    failing("setItem");
    await adapter.set("cart", 1);
    await expect(adapter.setExpire("cart", 1)).resolves.toBeUndefined();
    vi.spyOn(adapter, "_forgetEntry").mockImplementation(() => {
      throw new Error("storage failed");
    });
    await expect(adapter.deleteExpire("cart")).resolves.toBeUndefined();
  });
});

describe("IndexedDBAdapter — when the database fails", () => {
  /** An adapter whose database never opens */
  function unopenable() {
    freshStorage("IndexedDBAdapter");
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      const request = {};
      setTimeout(() => {
        request.error = new Error("blocked");
        request.onerror?.();
      }, 0);
      return request;
    });
    return openStorage("IndexedDBAdapter");
  }

  it("every method logs and answers as documented", async () => {
    const adapter = unopenable();
    await expect(adapter.delete("cart")).resolves.toBeUndefined();
    expect(await adapter.list()).toEqual([]);
    expect(await adapter.has("cart")).toBe(false);
    await expect(adapter.clear()).resolves.toBeUndefined();
    await expect(adapter.reset()).resolves.toBeUndefined();
    await expect(adapter.setExpire("cart", 1)).resolves.toBeUndefined();
    await expect(adapter.deleteExpire("cart")).resolves.toBeUndefined();
    await expect(adapter.clearExpire()).resolves.toBeUndefined();
  });

  it("waitReadiness answers why the database did not open", async () => {
    const adapter = unopenable();
    await expect(adapter.waitReadiness(1, 2)).rejects.toThrow("blocked");
  });

  it("waitReadiness gives up when the database never answers", async () => {
    freshStorage("IndexedDBAdapter");
    vi.spyOn(indexedDB, "open").mockImplementation(() => ({}));
    const adapter = openStorage("IndexedDBAdapter");
    await expect(adapter.waitReadiness(1, 2)).rejects.toThrow("Database is not ready");
  });

  it("waitReadiness resolves once the database is open", async () => {
    freshStorage("IndexedDBAdapter");
    await expect(openStorage("IndexedDBAdapter").waitReadiness()).resolves.toBeUndefined();
  });

  it("opens even when the metadata cannot be read", async () => {
    freshStorage("IndexedDBAdapter");
    const realGet = IDBObjectStore.prototype.get;
    vi.spyOn(IDBObjectStore.prototype, "get").mockImplementation(function (key) {
      if (!String(key).endsWith("__meta")) {
        return realGet.call(this, key);
      }
      const request = { error: new Error("meta unreadable") };
      setTimeout(() => request.onerror?.(), 0);
      return request;
    });
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.waitReadiness(5, 20);
    vi.restoreAllMocks();
    expect(await adapter.set("cart", 1)).toBe(true);
  });

  it("a failed request aborts its transaction and the write answers false", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.waitReadiness();
    vi.spyOn(adapter, "_changeExpires").mockRejectedValueOnce(new Error("request failed"));
    expect(await adapter.set("cart", 1)).toBe(false);
    expect(await adapter.get("cart")).toBeNull();
  });

  it("a request that errors rejects with its error", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    const request = {};
    const answer = adapter._answerOf(request);
    request.error = new Error("request error");
    request.onerror();
    await expect(answer).rejects.toThrow("request error");
  });

  it("an aborted transaction without an error of its own still rejects", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.waitReadiness();
    await expect(
      adapter._withStore("readwrite", async (store) => {
        store.transaction.abort();
      }),
    ).rejects.toThrow();
  });

  it("tells the other tabs about a reset", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter", { channelName: uniqueChannel(), enableSyncTabs: true });
    await adapter.set("cart", 1);
    const told = vi.spyOn(adapter, "emitDataChange");
    await adapter.reset();
    expect(told).toHaveBeenCalledWith("cart", undefined, "reset");
    await settle();
  });
});

describe("StorageAdapter — the abstract base", () => {
  it.each([
    "get",
    "list",
    "reset",
    "clear",
    "setExpire",
    "deleteExpire",
    "has",
    "_read",
    "_writeNow",
    "_deleteNow",
    "_storedKeys",
    "_resetNow",
    "_loadExpires",
    "_expire",
  ])("%s must be implemented by the adapter", async (method) => {
    await expect(new StorageAdapter()[method]("key")).rejects.toThrow("Not implemented");
  });

  it("set, delete and clearExpire log what the adapter does not implement, as they log any failure", async () => {
    const adapter = new StorageAdapter();
    expect(await adapter.set("key", 1)).toBe(false);
    await expect(adapter.delete("key")).resolves.toBeUndefined();
    await expect(adapter.clearExpire()).resolves.toBeUndefined();
  });

  it("a message tells no value by itself: the other tabs read storage", () => {
    expect(new StorageAdapter()._messageValue("stored")).toBeUndefined();
  });

  it.each([[""], [42], [{}]])("refuses a password that is not a non-empty string (%j)", (password) => {
    expect(() => new StorageAdapter()._setEncryption(password)).toThrow("Storagefy: password must be a non-empty string");
  });
});
