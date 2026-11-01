import { describe, it, expect, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import { freshStorage, openStorage, closeAll, uniqueChannel } from "../__fixtures__/storages.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";

// ------------------------------------------------------------------------------------------------
// IndexedDB: a write is saved only when its transaction is over. A request that succeeds may still be undone when the
// transaction aborts (the storage is full): up to 1.2.x the write answered "saved" at the request, the app was never
// told, and the other tabs were told about a value that was not there. And one write is one transaction — up to 1.2.x
// it was three (the value, then the expirations read and written again), and two writes at once could lose an
// expiration.
// ------------------------------------------------------------------------------------------------

/** Every write from now on succeeds as a request and is then undone by its transaction */
function abortEveryWrite() {
  const realPut = IDBObjectStore.prototype.put;
  return vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (...args) {
    const request = realPut.apply(this, args);
    const transaction = this.transaction;
    request.addEventListener("success", () => transaction.abort());
    return request;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

describe("IndexedDBAdapter — a write is saved when its transaction is", () => {
  it("answers false when the transaction undoes the write — and nothing is stored", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.waitReadiness();
    abortEveryWrite();

    expect(await adapter.set("cart", { items: 1 })).toBe(false);

    vi.restoreAllMocks();
    expect(await adapter.get("cart")).toBeNull();
  });

  it("does not tell the other tabs about a write that was undone", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter", { channelName: uniqueChannel(), enableSyncTabs: true });
    await adapter.waitReadiness();
    const told = vi.spyOn(adapter, "emitDataChange");
    abortEveryWrite();

    await adapter.set("cart", { items: 1 });

    expect(told).not.toHaveBeenCalled();
  });

  it("a store's onError hears of it", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.waitReadiness();
    abortEveryWrite();
    const errors = [];
    const store = defineStore("cart", { state: () => ({ items: 1 }) })(createPinia());

    await new PiniaAdapter(adapter).setInStorage(store, "cart", { onError: (error) => errors.push(error.message) });

    expect(errors).toEqual(['Storagefy: could not save "cart"']);
  });
});

describe("IndexedDBAdapter — one transaction per write", () => {
  it("writes a value without expiration in one transaction", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.waitReadiness();
    const transactions = vi.spyOn(IDBDatabase.prototype, "transaction");

    await adapter.set("cart", { items: 1 });

    expect(transactions).toHaveBeenCalledTimes(1);
    expect(transactions).toHaveBeenCalledWith(adapter.storeName, "readwrite");
  });

  it("writes a value and its expiration in one transaction", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.waitReadiness();
    const transactions = vi.spyOn(IDBDatabase.prototype, "transaction");

    await adapter.set("cart", { items: 1 }, 60_000);

    expect(transactions).toHaveBeenCalledTimes(1);
    expect(await adapter.getExpire("cart")).toBeGreaterThan(Date.now());
  });

  it("keeps the expiration of every key written at once", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.waitReadiness();

    await Promise.all(["a", "b", "c", "d"].map((key) => adapter.set(key, 1, 60_000)));

    const expires = await Promise.all(["a", "b", "c", "d"].map((key) => adapter.getExpire(key)));
    expect(expires.every((time) => typeof time === "number")).toBe(true);
  });
});
