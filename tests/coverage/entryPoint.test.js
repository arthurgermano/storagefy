import { describe, it, expect, vi } from "vitest";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

// ------------------------------------------------------------------------------------------------
// The entry point: startStoragefy and the store adapter factories, each way of getting a storage adapter.
// ------------------------------------------------------------------------------------------------

/** The entry point as a fresh import: nothing started */
async function freshEntryPoint() {
  vi.resetModules();
  const window = new Window();
  globalThis.localStorage = window.localStorage;
  globalThis.sessionStorage = window.sessionStorage;
  globalThis.indexedDB = new IDBFactory();
  return import("../../src/index.js");
}

const quiet = { expireCheckInterval: 0 };

describe("startStoragefy and getStorageAdapter", () => {
  it("getStorageAdapter needs a started adapter", async () => {
    const storagefy = await freshEntryPoint();
    expect(() => storagefy.getStorageAdapter()).toThrow("Storage adapter not initialized. Call startStoragefy first.");
  });

  it.each([
    ["indexedDB", "IndexedDBAdapter"],
    ["localStorage", "LocalStorageAdapter"],
    ["sessionStorage", "SessionStorageAdapter"],
  ])("starts the %s adapter", async (adapter, className) => {
    const storagefy = await freshEntryPoint();
    expect(storagefy.startStoragefy({ ...quiet, adapter })).toBeInstanceOf(storagefy[className]);
  });

  it("starts IndexedDB by default, keeps it, and makes a new one only when forced", async () => {
    const storagefy = await freshEntryPoint();
    const started = storagefy.startStoragefy(quiet);
    expect(started).toBeInstanceOf(storagefy.IndexedDBAdapter);
    expect(storagefy.startStoragefy({ ...quiet, adapter: "localStorage" })).toBe(started);

    const forced = storagefy.startStoragefy({ ...quiet, adapter: "localStorage", forceRecreate: true });
    expect(forced).not.toBe(started);
    expect(storagefy.getStorageAdapter()).toBe(forced);
  });

  it("passes the encryption options to the adapter", async () => {
    const storagefy = await freshEntryPoint();
    const adapter = storagefy.startStoragefy({ ...quiet, adapter: "localStorage", encrypt: true, password: "pw", keyDerivation: "pbkdf2" });
    expect([adapter.encrypt, adapter.password, adapter.keyDerivation]).toEqual([true, "pw", "pbkdf2"]);
  });
});

describe.each([
  ["getPiniaAdapter", "PiniaAdapter"],
  ["getReactAdapter", "ReactAdapter"],
  ["getSvelteAdapter", "SvelteAdapter"],
])("%s", (factory, className) => {
  /** The store adapter behind what the factory returned (Pinia returns its methods) */
  const storageOf = (storagefy, made) => (made instanceof storagefy[className] ? made.adapter : made.setInStorage);

  it("needs a storage adapter — started, given or described", async () => {
    const storagefy = await freshEntryPoint();
    expect(() => storagefy[factory]()).toThrow("Storage adapter not initialized. Call startStoragefy first.");
  });

  it("uses the started storage adapter, and keeps the store adapter it made", async () => {
    const storagefy = await freshEntryPoint();
    storagefy.startStoragefy({ ...quiet, adapter: "localStorage" });
    const first = storagefy[factory]();
    const again = storagefy[factory]();
    expect(typeof first.setInStorage).toBe("function");
    expect(typeof first.getFromStorage).toBe("function");
    if (first instanceof storagefy[className]) {
      expect(again).toBe(first);
    }
  });

  it("over a storage adapter given, or the options of a new one", async () => {
    const storagefy = await freshEntryPoint();
    const given = new storagefy.LocalStorageAdapter({ dbName: "given", ...quiet });
    expect(storagefy[factory]({ adapter: given, fresh: true }).adapter).toBe(given);

    const described = storagefy[factory]({ adapterParams: { dbName: "described", adapter: "sessionStorage", ...quiet }, fresh: true });
    expect(described.adapter).toBeInstanceOf(storagefy.SessionStorageAdapter);
    expect(storageOf(storagefy, described)).toBeDefined();
  });

  it("forceRecreate makes a new store adapter", async () => {
    const storagefy = await freshEntryPoint();
    storagefy.startStoragefy({ ...quiet, adapter: "localStorage" });
    const first = storagefy[factory]();
    const forced = storagefy[factory]({ forceRecreate: true });
    if (first instanceof storagefy[className]) {
      expect(forced).not.toBe(first);
    } else {
      expect(forced.setInStorage).not.toBe(first.setInStorage);
    }
  });
});

describe("set*Storage — loading and keeping a store", () => {
  it("setPiniaStorage loads what was kept and keeps every change", async () => {
    const storagefy = await freshEntryPoint();
    const { createPinia, defineStore } = await import("pinia");
    const adapter = storagefy.startStoragefy({ ...quiet, adapter: "localStorage" });
    await adapter.set("cart", { items: 4 });
    const store = defineStore("cart", { state: () => ({ items: 0 }) })(createPinia());

    await storagefy.setPiniaStorage(store, "cart");

    expect(store.items).toBe(4);
  });

  it("setReactStorage and setSvelteStorage do the same with their stores", async () => {
    const storagefy = await freshEntryPoint();
    const { create } = await import("zustand");
    const { writable, get } = await import("svelte/store");
    const adapter = storagefy.startStoragefy({ ...quiet, adapter: "localStorage" });
    await adapter.set("react", { items: 5 });
    await adapter.set("svelte", { items: 6 });
    const reactStore = create(() => ({ items: 0 }));
    const svelteStore = writable({ items: 0 });

    await storagefy.setReactStorage(reactStore, "react");
    await storagefy.setSvelteStorage(svelteStore, "svelte");

    expect(reactStore.getState().items).toBe(5);
    expect(get(svelteStore).items).toBe(6);
  });
});
