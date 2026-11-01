import { describe, it, expect, vi } from "vitest";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

// ------------------------------------------------------------------------------------------------
// forceRecreate replaces what is kept, and ends what it replaced. Up to 1.3.0 startStoragefy({ forceRecreate }) left
// the old storage adapter running (its watcher, its channel, its IndexedDB connection) and the store adapters kept
// over it went on writing there; get*Adapter({ forceRecreate }) left the old store adapter keeping its stores, so a
// store kept again was written twice.
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

const quiet = { expireCheckInterval: 0, adapter: "localStorage" };

/** Lets the writes of a store change run */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("startStoragefy({ forceRecreate })", () => {
  it("destroys the adapter it replaces, and the store adapters kept over it stop keeping their stores", async () => {
    const storagefy = await freshEntryPoint();
    const { createPinia, defineStore } = await import("pinia");
    const old = storagefy.startStoragefy({ ...quiet, dbName: "old" });
    const destroyed = vi.spyOn(old, "destroy");
    const cart = defineStore("cart", { state: () => ({ items: 1 }) })(createPinia());
    await storagefy.setPiniaStorage(cart, "cart");

    const replacing = storagefy.startStoragefy({ ...quiet, dbName: "new", forceRecreate: true });
    cart.$patch({ items: 2 });
    await settle();

    expect(destroyed).toHaveBeenCalledOnce();
    expect(await old.get("cart")).toEqual({ items: 1 });
    expect(await replacing.get("cart")).toBeNull();

    // Kept again: by a new store adapter, over the new storage adapter
    await storagefy.setPiniaStorage(cart, "cart");
    expect(await replacing.get("cart")).toEqual({ items: 2 });
    expect(storagefy.getPiniaAdapter().setInStorage).toBeTypeOf("function");
  });

  it("leaves alone the store adapters kept over another storage adapter", async () => {
    const storagefy = await freshEntryPoint();
    const { create } = await import("zustand");
    storagefy.startStoragefy({ ...quiet, dbName: "old" });
    const given = new storagefy.LocalStorageAdapter({ ...quiet, dbName: "given" });
    const kept = storagefy.getReactAdapter({ adapter: given });
    const store = create(() => ({ items: 1 }));
    await kept.setInStorage(store, "react");

    storagefy.startStoragefy({ ...quiet, dbName: "new", forceRecreate: true });
    store.setState({ items: 2 });
    await settle();

    expect(storagefy.getReactAdapter()).toBe(kept);
    expect(await given.get("react")).toEqual({ items: 2 });
  });
});

describe.each(["getPiniaAdapter", "getReactAdapter", "getSvelteAdapter"])("%s({ forceRecreate })", (factory) => {
  it("the store adapter replaced stops keeping its stores", async () => {
    const storagefy = await freshEntryPoint();
    const { writable } = await import("svelte/store");
    const { create } = await import("zustand");
    const { createPinia, defineStore } = await import("pinia");
    const storage = storagefy.startStoragefy({ ...quiet, dbName: "app" });
    const stores = {
      getPiniaAdapter: () => defineStore("s", { state: () => ({ items: 1 }) })(createPinia()),
      getReactAdapter: () => create(() => ({ items: 1 })),
      getSvelteAdapter: () => writable({ items: 1 }),
    };
    const change = {
      getPiniaAdapter: (store) => store.$patch({ items: 2 }),
      getReactAdapter: (store) => store.setState({ items: 2 }),
      getSvelteAdapter: (store) => store.set({ items: 2 }),
    };
    const store = stores[factory]();
    await storagefy[factory]().setInStorage(store, "s");

    storagefy[factory]({ forceRecreate: true });
    change[factory](store);
    await settle();

    expect(await storage.get("s")).toEqual({ items: 1 });
  });
});
