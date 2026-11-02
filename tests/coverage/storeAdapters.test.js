import { describe, it, expect, afterEach, vi } from "vitest";
import { createStore as createReduxStore } from "redux";
import { writable } from "svelte/store";
import { freshStorage, openStorage, closeAll, uniqueChannel, settle } from "../__fixtures__/storages.js";
import StoreAdapter from "../../src/stores/StoreAdapter.js";
import ReactAdapter from "../../src/stores/ReactAdapter.js";
import SvelteAdapter from "../../src/stores/SvelteAdapter.js";

// ------------------------------------------------------------------------------------------------
// The store adapters' remaining paths: the abstract base, how a React store of each shape receives another tab's
// state, stores React cannot keep, empty Svelte values, ignoreKeys over arrays.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

/** A store of the shape asked: subscribe, plus the methods named */
function customStore(initial, methods) {
  let state = initial;
  const listeners = new Set();
  const set = (next) => {
    state = next;
    listeners.forEach((listener) => listener(state));
  };
  const all = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState: () => state,
    setState: (next) => set({ ...state, ...next }),
    get: () => state,
    set,
    update: (change) => set(change(state)),
  };
  const store = { subscribe: all.subscribe };
  for (const name of methods) store[name] = all[name];
  return { store, read: () => state, write: set };
}

describe("StoreAdapter — the abstract base", () => {
  it("needs a storage adapter", () => {
    expect(() => new StoreAdapter()).toThrow("Adapter provided is not defined");
  });

  it("setInStorage and getFromStorage must be implemented", async () => {
    const base = new StoreAdapter({});
    await expect(base.setInStorage({}, "k")).rejects.toThrow("Not implemented");
    await expect(base.getFromStorage({}, "k")).rejects.toThrow("Not implemented");
  });

  it.each(["_checkStore", "_currentOf", "_apply", "_subscribe", "_load"])("%s must be implemented by the adapter", (hook) => {
    expect(() => new StoreAdapter({})[hook]({})).toThrow("Not implemented");
  });

  it("leaves out ignored keys of the objects inside an array", () => {
    const base = new StoreAdapter({});
    expect(base.omitKeys([{ token: "x", name: "a" }], ["0.token"])).toEqual([{ token: undefined, name: "a" }]);
  });

  it("destroy of a key not kept does nothing", () => {
    expect(() => new StoreAdapter({}).destroy("nothing")).not.toThrow();
  });
});

describe("ReactAdapter — each shape of store receives another tab's state", () => {
  it.each([
    ["Redux (dispatch)", null],
    ["Zustand-like (getState + setState)", ["getState", "setState"]],
    ["update", ["update"]],
    ["set + get", ["set", "get"]],
    ["set only", ["set"]],
  ])("%s", async (_shape, methods) => {
    freshStorage("LocalStorageAdapter");
    const channel = uniqueChannel();
    const here =
      methods === null
        ? (() => {
            const store = createReduxStore((state = { items: 0 }, action) =>
              action.type === "STORAGEFY_UPDATE" ? { ...state, ...action.payload } : state,
            );
            return { store, read: () => store.getState() };
          })()
        : customStore({ items: 0 }, methods);
    const hereStorage = openStorage("LocalStorageAdapter", { channelName: channel, enableSyncTabs: true });
    await new ReactAdapter(hereStorage).setInStorage(here.store, "cart", { syncTabs: true });
    if (methods !== null && !methods.includes("getState")) {
      here.write({ items: 0 });
    }
    await settle();

    const thereStorage = openStorage("LocalStorageAdapter", { channelName: channel, enableSyncTabs: true });
    await thereStorage.set("cart", { items: 7 });
    await settle();

    expect(here.read().items).toBe(7);
  });

  it("a store with no way to be updated keeps its state — the reason is logged", async () => {
    freshStorage("LocalStorageAdapter");
    const channel = uniqueChannel();
    const here = customStore({ items: 0 }, ["get"]);
    const hereStorage = openStorage("LocalStorageAdapter", { channelName: channel, enableSyncTabs: true });
    await new ReactAdapter(hereStorage).setInStorage(here.store, "cart", { syncTabs: true });

    await openStorage("LocalStorageAdapter", { channelName: channel, enableSyncTabs: true }).set("cart", { items: 7 });
    await settle();

    expect(here.read().items).toBe(0);
  });

  it("a store without getState is written on its first change, not at once", async () => {
    freshStorage("LocalStorageAdapter");
    const adapter = openStorage("LocalStorageAdapter");
    const { store, write } = customStore({ items: 1 }, ["setState"]);
    await new ReactAdapter(adapter).setInStorage(store, "cart");
    expect(await adapter.get("cart")).toBeNull();

    write({ items: 2 });
    await vi.waitFor(async () => expect(await adapter.get("cart")).toEqual({ items: 2 }));
  });

  it("an empty state is not written", async () => {
    freshStorage("LocalStorageAdapter");
    const adapter = openStorage("LocalStorageAdapter");
    const { store } = customStore(null, ["getState"]);
    await new ReactAdapter(adapter).setInStorage(store, "cart");
    expect(await adapter.get("cart")).toBeNull();
  });

  it("getFromStorage refuses a store it cannot set", async () => {
    freshStorage("LocalStorageAdapter");
    const adapter = openStorage("LocalStorageAdapter");
    await adapter.set("cart", { items: 1 });
    const { store } = customStore({ items: 0 }, ["get"]);
    await expect(new ReactAdapter(adapter).getFromStorage(store, "cart")).rejects.toThrow(
      "Cannot update store: setState or dispatch method not found",
    );
  });

  it.each([
    [null, "Store provided is not defined"],
    [{}, "Store must have a subscribe method"],
    [{ subscribe: () => () => {} }, "Store must have one of: getState, setState, get, set, update"],
  ])("refuses a store it cannot keep (%j)", async (store, message) => {
    freshStorage("LocalStorageAdapter");
    await expect(new ReactAdapter(openStorage("LocalStorageAdapter")).setInStorage(store, "cart")).rejects.toThrow(message);
  });
});

describe("SvelteAdapter — an empty value", () => {
  it("is not written", async () => {
    freshStorage("LocalStorageAdapter");
    const adapter = openStorage("LocalStorageAdapter");
    await expect(new SvelteAdapter(adapter).setInStorage(writable(null), "cart")).resolves.toBe(true);
    expect(await adapter.get("cart")).toBeNull();
  });
});
