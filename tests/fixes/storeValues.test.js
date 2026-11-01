import { describe, it, expect, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import { writable, get } from "svelte/store";
import { create } from "zustand";
import { createStore as createReduxStore } from "redux";
import { freshStorage, openStorage, closeAll, uniqueChannel, settle } from "../__fixtures__/storages.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";
import ReactAdapter from "../../src/stores/ReactAdapter.js";
import SvelteAdapter from "../../src/stores/SvelteAdapter.js";

// ------------------------------------------------------------------------------------------------
// What a store holds is what is stored, and what is loaded back. Up to the first 1.3.0 build:
//   - a store set to null (a sign-out) was never written: after a reload the old state came back; 0, false and ""
//     were not written either
//   - an array state came back as an object ({ "0": … }); a number or a string made getFromStorage throw
//   - a change of another tab was marked inside the store's state (STORAGEFY_SILENT_CHANNEL_UPDATE), which the
//     store's other subscribers saw
//   - two changes of another tab could land in the reverse order (sessionStorage, encrypted), leaving the older state
//   - a store followed the changes of any namespace on its channel
// ------------------------------------------------------------------------------------------------

afterEach(async () => {
  vi.restoreAllMocks();
  await closeAll();
});

/** Two tabs of one app on localStorage, with sync between them */
function twoTabs(name = "LocalStorageAdapter", options = {}) {
  freshStorage(name);
  const channelName = uniqueChannel();
  const tab = () => openStorage(name, { channelName, enableSyncTabs: true, ...options });
  return { here: tab(), there: tab() };
}

describe("a store set to null", () => {
  it("Svelte: removes the stored state — a reload does not bring it back", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const user = writable({ name: "Ana" });
    await new SvelteAdapter(storage).setInStorage(user, "user");

    user.set(null);
    await settle();

    expect(await storage.has("user")).toBe(false);
    const reloaded = writable(null);
    expect(await new SvelteAdapter(storage).getFromStorage(reloaded, "user")).toBeUndefined();
    expect(get(reloaded)).toBeNull();
  });

  it("React (Zustand): removes the stored state", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const user = create(() => ({ name: "Ana" }));
    await new ReactAdapter(storage).setInStorage(user, "user");

    user.setState(null, true);
    await settle();

    expect(await storage.has("user")).toBe(false);
  });

  it("Svelte: undefined removes the stored state too", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const user = writable({ name: "Ana" });
    await new SvelteAdapter(storage).setInStorage(user, "user");

    user.set(undefined);
    await settle();

    expect(await storage.has("user")).toBe(false);
  });

  it("Svelte: a store created without a value keeps what was stored once it is loaded (setSvelteStorage's order)", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    await storage.set("user", { name: "Ana" });
    const user = writable();
    const svelte = new SvelteAdapter(storage);

    await svelte.getFromStorage(user, "user");
    await svelte.setInStorage(user, "user");

    expect(get(user)).toEqual({ name: "Ana" });
    expect(await storage.get("user")).toEqual({ name: "Ana" });
  });

  it("React (Zustand): undefined removes the stored state too", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const user = create(() => ({ name: "Ana" }));
    await new ReactAdapter(storage).setInStorage(user, "user");

    user.setState(undefined, true);
    await settle();

    expect(await storage.has("user")).toBe(false);
  });

  it("Redux: a listener is called without the state — the state is read with getState, never taken as undefined", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const store = createReduxStore((state = { items: 1 }, action) => (action.type === "ADD" ? { items: state.items + 1 } : state));
    await new ReactAdapter(storage).setInStorage(store, "cart");

    store.dispatch({ type: "ADD" });
    await settle();

    expect(await storage.get("cart")).toEqual({ items: 2 });
  });
});

/**
 * A store without getState, as a library might write one: listeners told with or without the state.
 * @param {any} initial
 * @param {{ withGet?: boolean, passesState?: boolean }} shape
 */
function listenerStore(initial, { withGet = false, passesState = true }) {
  let state = initial;
  const listeners = new Set();
  const store = {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState: (next) => {
      state = next;
      listeners.forEach((listener) => (passesState ? listener(state) : listener()));
    },
  };
  if (withGet) {
    store.get = () => state;
  }
  return store;
}

describe("React: a store without getState", () => {
  it("that passes its state to its listeners — undefined removes, a value is written", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const store = listenerStore({ items: 1 }, { passesState: true });
    await new ReactAdapter(storage).setInStorage(store, "cart");

    store.setState({ items: 2 });
    await settle();
    expect(await storage.get("cart")).toEqual({ items: 2 });

    store.setState(undefined);
    await settle();
    expect(await storage.has("cart")).toBe(false);
  });

  it("that calls its listeners without the state — nothing is written nor removed", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    await storage.set("cart", { items: 1 });
    const store = listenerStore({ items: 1 }, { passesState: false });
    await new ReactAdapter(storage).setInStorage(store, "cart");

    store.setState({ items: 2 });
    await settle();

    expect(await storage.get("cart")).toEqual({ items: 1 });
  });

  it("with get — the state is read with get, whatever the listener receives", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const store = listenerStore({ items: 1 }, { withGet: true, passesState: false });
    await new ReactAdapter(storage).setInStorage(store, "cart");

    store.setState({ items: 2 });
    await settle();
    expect(await storage.get("cart")).toEqual({ items: 2 });

    store.setState(undefined);
    await settle();
    expect(await storage.has("cart")).toBe(false);
  });
});

describe("any value a store holds — written and loaded back as it is", () => {
  it.each([
    ["0", 5, 0],
    ["false", true, false],
    ['""', "text", ""],
    ["a number", 0, 42],
    ["an array", [], ["a", "b"]],
  ])("Svelte: %s", async (_case, initial, value) => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const store = writable(initial);
    await new SvelteAdapter(storage).setInStorage(store, "value");

    store.set(value);
    await settle();
    expect(await storage.get("value")).toEqual(value);

    const reloaded = writable(initial === value ? null : initial);
    expect(await new SvelteAdapter(storage).getFromStorage(reloaded, "value")).toBe(true);
    expect(get(reloaded)).toEqual(value);
  });

  it("React (Zustand): an array state stays an array", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    await new ReactAdapter(storage).setInStorage(create(() => ["x", "y"]), "list");

    const reloaded = create(() => []);
    await new ReactAdapter(storage).getFromStorage(reloaded, "list");

    expect(reloaded.getState()).toEqual(["x", "y"]);
  });

  it("Pinia: a stored value that is not an object is not loaded — onError says why", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    await storage.set("cart", [1, 2]);
    const cart = defineStore("cart", { state: () => ({ items: 0 }) })(createPinia());
    const errors = [];

    expect(await new PiniaAdapter(storage).getFromStorage(cart, "cart", { onError: (error) => errors.push(error) })).toBeUndefined();

    expect(cart.items).toBe(0);
    expect(errors.map((error) => [error.message, error.cause.message])).toEqual([
      ['Storagefy: could not read "cart"', "Storagefy: the stored state of a Pinia store must be an object"],
    ]);
  });
});

describe("another tab's state", () => {
  it("Svelte: a number or an array replaces the state", async () => {
    const { here, there } = twoTabs();
    const counter = writable(1);
    const list = writable(["a"]);
    await new SvelteAdapter(here).setInStorage(counter, "counter", { syncTabs: true });
    await new SvelteAdapter(here).setInStorage(list, "list", { syncTabs: true });

    await there.set("counter", 7);
    await there.set("list", ["b", "c"]);
    await settle();

    expect([get(counter), get(list)]).toEqual([7, ["b", "c"]]);
  });

  it("React (Zustand): an array replaces the state — merged, it would become an object", async () => {
    const { here, there } = twoTabs();
    const list = create(() => ["a"]);
    await new ReactAdapter(here).setInStorage(list, "list", { syncTabs: true });

    await there.set("list", ["b", "c"]);
    await settle();

    expect(list.getState()).toEqual(["b", "c"]);
  });

  it("is not marked inside the state: the store's other subscribers see only the state", async () => {
    const { here, there } = twoTabs();
    const cart = writable({ items: 1 });
    const seen = [];
    cart.subscribe((state) => seen.push({ ...state })); // a copy: what the subscriber saw at that moment
    await new SvelteAdapter(here).setInStorage(cart, "cart", { syncTabs: true });
    const zustand = create(() => ({ items: 1 }));
    await new ReactAdapter(here).setInStorage(zustand, "zustand", { syncTabs: true });

    await there.set("cart", { items: 2 });
    await there.set("zustand", { items: 2 });
    await settle();

    expect(seen.at(-1)).toEqual({ items: 2 });
    expect(seen.every((state) => !("STORAGEFY_SILENT_CHANNEL_UPDATE" in state))).toBe(true);
    expect(zustand.getState()).toEqual({ items: 2 });
  });

  it("is not written back by the store that applies it", async () => {
    const { here, there } = twoTabs();
    const cart = writable({ items: 1 });
    await new SvelteAdapter(here).setInStorage(cart, "cart", { syncTabs: true });
    const writes = vi.spyOn(here, "set");

    await there.set("cart", { items: 2 });
    await settle();

    expect(get(cart)).toEqual({ items: 2 });
    expect(writes).not.toHaveBeenCalled();
  });

  it("Pinia: a state that is not an object is not applied — onError says why", async () => {
    const { here, there } = twoTabs();
    const cart = defineStore("cart", { state: () => ({ items: 1 }) })(createPinia());
    const errors = [];
    await new PiniaAdapter(here).setInStorage(cart, "cart", { syncTabs: true, onError: (error) => errors.push(error) });

    await there.set("cart", [1, 2]);
    await settle();

    expect(cart.items).toBe(1);
    expect(errors.map((error) => [error.message, error.cause.message])).toEqual([
      ['Storagefy: could not apply "cart"', "Storagefy: the stored state of a Pinia store must be an object"],
    ]);
  });

  it("a store that throws while applying it is told through onError — the next change is still applied", async () => {
    const { here, there } = twoTabs();
    const store = createReduxStore((state = { items: 1 }, action) => {
      if (action.type === "STORAGEFY_UPDATE" && action.payload.items === 2) {
        throw new Error("reducer bug");
      }
      return action.type === "STORAGEFY_UPDATE" ? action.payload : state;
    });
    const errors = [];
    await new ReactAdapter(here).setInStorage(store, "cart", { syncTabs: true, onError: (error) => errors.push(error) });

    await there.set("cart", { items: 2 });
    await settle();
    await there.set("cart", { items: 3 });
    await settle();

    expect(errors.map((error) => [error.message, error.cause.message])).toEqual([
      ['Storagefy: could not apply "cart"', "reducer bug"],
    ]);
    expect(store.getState()).toEqual({ items: 3 });
  });

  it("is applied in the order the changes came — sessionStorage, encrypted: the first takes longer to decrypt", async () => {
    const { here, there } = twoTabs("SessionStorageAdapter", { encrypt: true, password: "app-secret" });
    const cart = defineStore("cart", { state: () => ({ n: 0 }) })(createPinia());
    await new PiniaAdapter(here).setInStorage(cart, "cart", { syncTabs: true });
    // A large value takes longer to decrypt than a small one: the first change is made the slower
    const decrypt = here._decrypt.bind(here);
    let calls = 0;
    vi.spyOn(here, "_decrypt").mockImplementation(async (...args) => {
      calls += 1;
      if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 40));
      return decrypt(...args);
    });

    await there.set("cart", { n: 1 });
    await there.set("cart", { n: 2 });
    await vi.waitFor(() => expect(calls).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(cart.n).toBe(2);
  });

  it("localStorage: is applied even when this tab's localStorage does not show the write yet (Firefox)", async () => {
    // Firefox may deliver the message before the other tab's localStorage shows the write: read there, the change
    // would be the old state, and dropped as already held. The message carries the stored value
    const { here, there } = twoTabs();
    const cart = writable({ items: 1 });
    await new SvelteAdapter(here).setInStorage(cart, "cart", { syncTabs: true });
    const stale = here._storage.getItem(here._fullKey("cart"));
    const getItem = here._storage.getItem.bind(here._storage);
    vi.spyOn(here._storage, "getItem").mockImplementation((key) => (key === here._fullKey("cart") ? stale : getItem(key)));

    await there.set("cart", { items: 2 });
    await settle();

    expect(get(cart)).toEqual({ items: 2 });
  });

  it("of another namespace on the same channel is not applied", async () => {
    freshStorage("SessionStorageAdapter");
    const channelName = uniqueChannel();
    const appA = openStorage("SessionStorageAdapter", { dbName: "appA", channelName, enableSyncTabs: true });
    const appB = openStorage("SessionStorageAdapter", { dbName: "appB", channelName, enableSyncTabs: true });
    const cart = writable({ items: 1 });
    await new SvelteAdapter(appA).setInStorage(cart, "cart", { syncTabs: true });

    await appB.set("cart", { items: 99 });
    await settle();

    expect(get(cart)).toEqual({ items: 1 });
  });

  it("a message that is not a change (another library on the channel) is ignored", async () => {
    const { here } = twoTabs();
    const cart = writable({ items: 1 });
    await new SvelteAdapter(here).setInStorage(cart, "cart", { syncTabs: true });
    const other = new BroadcastChannel(here.channelName);

    for (const message of [null, "hello", 42, { key: "cart" }]) {
      other.postMessage(message);
    }
    await settle();
    other.close();

    expect(get(cart)).toEqual({ items: 1 });
  });

  it("a change still being read when the store stops being kept is not applied", async () => {
    const { here, there } = twoTabs();
    const cart = writable({ items: 1 });
    const svelte = new SvelteAdapter(here);
    await svelte.setInStorage(cart, "cart", { syncTabs: true });
    let release;
    const realDecrypt = here._decrypt.bind(here);
    vi.spyOn(here, "_decrypt").mockImplementation(async (...args) => {
      await new Promise((resolve) => (release = resolve));
      return realDecrypt(...args);
    });

    await there.set("cart", { items: 2 });
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    svelte.destroy("cart");
    release();
    await settle();

    expect(get(cart)).toEqual({ items: 1 });
  });
});
