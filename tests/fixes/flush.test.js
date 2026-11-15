import { describe, it, expect, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import { writable } from "svelte/store";
import { create } from "zustand";
import { createStore as createReduxStore } from "redux";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, uniqueChannel, settle } from "../__fixtures__/storages.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";
import ReactAdapter from "../../src/stores/ReactAdapter.js";
import SvelteAdapter from "../../src/stores/SvelteAdapter.js";

// ------------------------------------------------------------------------------------------------
// flush — the state of a store is in storage once it answers. Up to 1.4.0 there was no way to know it: an app that
// cleared a store on sign-out could not tell when the cleared state was written (a page closed meanwhile kept the
// person's data), and the one it found (the kept store's writing) was internal — 1.4.0 turned it from a promise into a
// boolean, and the app's wait ended at once.
// ------------------------------------------------------------------------------------------------

afterEach(async () => {
  vi.restoreAllMocks();
  await closeAll();
});

/** A Pinia store of its own Pinia */
function piniaStore(id = "user") {
  return defineStore(id, { state: () => ({ name: "Ana", draft: "" }) })(createPinia());
}

/**
 * Holds the writes of a storage adapter until open() — the store's writes then wait, and so must flush.
 * @param {object} storage
 */
function gateWrites(storage) {
  let open = () => {};
  const gate = new Promise((resolve) => {
    open = resolve;
  });
  const set = storage.set.bind(storage);
  const spy = vi.spyOn(storage, "set").mockImplementation(async (...args) => {
    await gate;
    return set(...args);
  });
  return { open, spy };
}

/** Counts the writes of a storage adapter, writing as it does */
function countWrites(storage) {
  const set = storage.set.bind(storage);
  return vi.spyOn(storage, "set").mockImplementation((...args) => set(...args));
}

/**
 * A store shaped like Zustand whose library tells a change only when told to (notify) — as a library that batches its
 * notifications does: flush must not wait to be told.
 * @param {any} initial
 */
function lateStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    notify: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

/** Whether a promise is settled by now — without waiting for it */
async function isSettled(promise) {
  let settled = false;
  promise.then(
    () => {
      settled = true;
    },
    () => {
      settled = true;
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  return settled;
}

describe.each(STORAGE_NAMES)("flush — %s", (name) => {
  /** A storage adapter on a fresh storage */
  function storage(options) {
    freshStorage(name);
    return openStorage(name, options);
  }

  it("writes a change its library has not told yet — and answers only once it is written", async () => {
    const kept = storage();
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user");
    const { open, spy } = gateWrites(kept);

    store.setState({ name: null });
    const flushing = react.flush("user");

    expect(await isSettled(flushing)).toBe(false);
    expect(spy).toHaveBeenCalledWith("user", { name: null }, undefined);
    open();
    expect(await flushing).toBe(true);
    expect(await kept.get("user")).toEqual({ name: null });
  });

  it("the change told after it writes nothing more — no second write, no second message to the other tabs", async () => {
    freshStorage(name);
    const channelName = uniqueChannel();
    const here = openStorage(name, { channelName, enableSyncTabs: true });
    const there = openStorage(name, { channelName, enableSyncTabs: true });
    const heard = [];
    there.onDataChanged((change) => heard.push(change.key));
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(here);
    await react.setInStorage(store, "user");
    await settle();
    heard.length = 0;
    const writes = countWrites(here);

    store.setState({ name: "Bia" });
    expect(await react.flush("user")).toBe(true);
    store.notify();
    await settle();

    expect(writes).toHaveBeenCalledTimes(1);
    // sessionStorage belongs to one tab: its adapters still tell each other on the channel
    expect(heard).toEqual(["user"]);
  });

  it("Pinia, a direct change: written before flush answers", async () => {
    const kept = storage();
    const store = piniaStore();
    const pinia = new PiniaAdapter(kept);
    await pinia.setInStorage(store, "user");
    const { open } = gateWrites(kept);

    store.name = null;
    const flushing = pinia.flush("user");

    expect(await isSettled(flushing)).toBe(false);
    open();
    expect(await flushing).toBe(true);
    expect(await kept.get("user")).toEqual({ name: null, draft: "" });
  });

  it("Pinia, $patch: written before flush answers, once", async () => {
    const kept = storage();
    const store = piniaStore();
    const pinia = new PiniaAdapter(kept);
    await pinia.setInStorage(store, "user");
    const writes = countWrites(kept);

    store.$patch({ name: "Bia" });

    expect(await pinia.flush("user")).toBe(true);
    expect(await kept.get("user")).toEqual({ name: "Bia", draft: "" });
    await settle();
    expect(writes).toHaveBeenCalledTimes(1);
  });

  it("a state already stored writes nothing, and answers true", async () => {
    const kept = storage();
    const store = piniaStore();
    const pinia = new PiniaAdapter(kept);
    await pinia.setInStorage(store, "user");
    const writes = countWrites(kept);

    expect(await pinia.flush("user")).toBe(true);
    expect(writes).not.toHaveBeenCalled();
  });

  it("a change of an ignored key alone writes nothing", async () => {
    const kept = storage();
    const store = lateStore({ name: "Ana", draft: "" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user", { ignoreKeys: ["draft"] });
    const writes = countWrites(kept);

    store.setState({ name: "Ana", draft: "half-typed" });

    expect(await react.flush("user")).toBe(true);
    expect(writes).not.toHaveBeenCalled();
  });

  it("a burst of changes: the last state is stored, in one write after the one in progress", async () => {
    const kept = storage();
    const store = lateStore({ step: 0 });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "wizard");
    const { open, spy } = gateWrites(kept);

    store.setState({ step: 1 });
    store.notify();
    store.setState({ step: 2 });
    store.notify();
    store.setState({ step: 3 });
    const flushing = react.flush("wizard");
    await new Promise((resolve) => setTimeout(resolve, 20));
    open();

    expect(await flushing).toBe(true);
    expect(await kept.get("wizard")).toEqual({ step: 3 });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("a write not saved: false, told through onError — never a rejection", async () => {
    const kept = storage();
    const onError = vi.fn();
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user", { onError });
    vi.spyOn(kept, "set").mockResolvedValue(false);

    store.setState({ name: null });

    expect(await react.flush("user")).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });

  it("a storage that throws: false, told through onError — never a rejection", async () => {
    const kept = storage();
    const onError = vi.fn();
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user", { onError });
    vi.spyOn(kept, "set").mockRejectedValue(new Error("disk on fire"));

    store.setState({ name: null });

    expect(await react.flush("user")).toBe(false);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("a write that failed is written again by the next flush, which answers for it", async () => {
    const kept = storage();
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user", { onError: () => {} });
    const failing = vi.spyOn(kept, "set").mockResolvedValueOnce(false);

    store.setState({ name: null });
    expect(await react.flush("user")).toBe(false);
    failing.mockRestore();

    expect(await react.flush("user")).toBe(true);
    expect(await kept.get("user")).toEqual({ name: null });
  });

  it("a state set to null removes the stored key — true", async () => {
    const kept = storage();
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user");

    store.setState(null);

    expect(await react.flush("user")).toBe(true);
    expect(await kept.has("user")).toBe(false);
  });
});

describe("flush — every store, and the keys it knows", () => {
  it("without a key: writes every store; one not saved makes it false, the others are written all the same", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const react = new ReactAdapter(kept);
    const user = lateStore({ name: "Ana" });
    const cart = lateStore({ items: 1 });
    await react.setInStorage(user, "user", { onError: () => {} });
    await react.setInStorage(cart, "cart", { onError: () => {} });
    const set = kept.set.bind(kept);
    vi.spyOn(kept, "set").mockImplementation(async (key, ...rest) => (key === "user" ? false : set(key, ...rest)));

    user.setState({ name: null });
    cart.setState({ items: 2 });

    expect(await react.flush()).toBe(false);
    expect(await kept.get("cart")).toEqual({ items: 2 });
  });

  it("without a key, every store saved: true", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const react = new ReactAdapter(kept);
    const user = lateStore({ name: "Ana" });
    const cart = lateStore({ items: 1 });
    await react.setInStorage(user, "user");
    await react.setInStorage(cart, "cart");

    user.setState({ name: null });
    cart.setState({ items: 2 });

    expect(await react.flush()).toBe(true);
    expect(await kept.get("user")).toEqual({ name: null });
    expect(await kept.get("cart")).toEqual({ items: 2 });
  });

  it("without a key and no store kept: true", async () => {
    freshStorage("LocalStorageAdapter");
    expect(await new PiniaAdapter(openStorage("LocalStorageAdapter")).flush()).toBe(true);
  });

  it("a key no store is kept under rejects — a mistake of the app", async () => {
    freshStorage("LocalStorageAdapter");
    const pinia = new PiniaAdapter(openStorage("LocalStorageAdapter"));
    await expect(pinia.flush("usr")).rejects.toThrow('no store is kept under the key "usr"');
  });

  it("a key whose store was destroyed rejects too", async () => {
    freshStorage("LocalStorageAdapter");
    const pinia = new PiniaAdapter(openStorage("LocalStorageAdapter"));
    await pinia.setInStorage(piniaStore(), "user");
    pinia.destroy("user");
    await expect(pinia.flush("user")).rejects.toThrow('no store is kept under the key "user"');
  });
});

describe("flush — while the store is being kept, or stops being kept", () => {
  it("before setInStorage is done: waits for it — a state found stored is not written again", async () => {
    freshStorage("IndexedDBAdapter");
    const kept = openStorage("IndexedDBAdapter");
    await kept.set("user", { name: "Ana", draft: "" });
    const store = piniaStore();
    const pinia = new PiniaAdapter(kept);
    await pinia.getFromStorage(store, "user");
    const writes = countWrites(kept);

    const keeping = pinia.setInStorage(store, "user");
    const flushed = await pinia.flush("user");

    expect(flushed).toBe(true);
    expect(await isSettled(keeping)).toBe(true);
    expect(writes).not.toHaveBeenCalled();
  });

  it("before setInStorage is done, with a change: written after the first write", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = piniaStore();
    const pinia = new PiniaAdapter(kept);

    const keeping = pinia.setInStorage(store, "user");
    store.name = "Bia";

    expect(await pinia.flush("user")).toBe(true);
    await keeping;
    expect(await kept.get("user")).toEqual({ name: "Bia", draft: "" });
  });

  it("when the first write of setInStorage threw: the state is written again — and flush answers for that write", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    vi.spyOn(kept, "set").mockRejectedValueOnce(new Error("first write"));

    const keeping = react.setInStorage(store, "user", { onError: () => {} });
    const flushing = react.flush("user");

    await expect(keeping).rejects.toThrow("first write");
    expect(await flushing).toBe(true);
    expect(await kept.get("user")).toEqual({ name: "Ana" });
  });

  it("destroyed meanwhile: answers once the write in progress is done, and writes nothing after", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user");
    const { open, spy } = gateWrites(kept);

    store.setState({ name: "Bia" });
    const flushing = react.flush("user");
    await new Promise((resolve) => setTimeout(resolve, 20));
    react.destroy("user");
    store.setState({ name: "Caio" });
    store.notify();
    open();

    expect(await flushing).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await kept.get("user")).toEqual({ name: "Bia" });
  });

  it("destroyed before its turn: writes nothing — only what was in progress is waited for", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    const keeping = react.setInStorage(store, "user");
    const writes = countWrites(kept);

    const flushing = react.flush("user");
    react.destroy("user");
    store.setState({ name: "Bia" });

    expect(await flushing).toBe(true);
    await keeping;
    expect(writes).not.toHaveBeenCalled();
    expect(await kept.has("user")).toBe(false);
  });

  it("kept again under the same key meanwhile: the flush of the store replaced ends with its writes", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const first = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(first, "user");
    const { open } = gateWrites(kept);

    first.setState({ name: "Bia" });
    const flushing = react.flush("user");
    await new Promise((resolve) => setTimeout(resolve, 20));
    const keepingAgain = react.setInStorage(lateStore({ name: "Caio" }), "user");
    open();

    expect(await flushing).toBe(true);
    await keepingAgain;
    expect(await kept.get("user")).toEqual({ name: "Caio" });
  });

  it("two flushes at once: the same answer, one write", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user");
    const writes = countWrites(kept);

    store.setState({ name: "Bia" });

    expect(await Promise.all([react.flush("user"), react.flush("user")])).toEqual([true, true]);
    expect(writes).toHaveBeenCalledTimes(1);
  });
});

describe("flush — the libraries", () => {
  it("React with subscribe alone (its state told to its listeners only): never written by flush — its writes are waited for", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const listeners = new Set();
    // set and subscribe, no getState nor get: the store gives its state to its listeners only
    const store = {
      set: () => {},
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user");
    for (const listener of listeners) {
      listener({ name: "Ana" });
    }
    const { open, spy } = gateWrites(kept);
    for (const listener of listeners) {
      listener({ name: "Bia" });
    }

    const flushing = react.flush("user");
    expect(await isSettled(flushing)).toBe(false);
    open();

    expect(await flushing).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await kept.get("user")).toEqual({ name: "Bia" });
  });

  it("React with subscribe alone and nothing told: writes nothing — never {}", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    await kept.set("user", { name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage({ set: () => {}, subscribe: () => () => {} }, "user");
    const writes = countWrites(kept);

    expect(await react.flush("user")).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    expect(await kept.get("user")).toEqual({ name: "Ana" });
  });

  it("Zustand", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = create(() => ({ items: 0 }));
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "cart");

    store.setState({ items: 3 });

    expect(await react.flush("cart")).toBe(true);
    expect(await kept.get("cart")).toEqual({ items: 3 });
  });

  it("Redux", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = createReduxStore((state = { items: 0 }, action) =>
      action.type === "add" ? { items: state.items + 1 } : state,
    );
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "cart");

    store.dispatch({ type: "add" });

    expect(await react.flush("cart")).toBe(true);
    expect(await kept.get("cart")).toEqual({ items: 1 });
  });

  it("Svelte", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = writable({ items: 0 });
    const svelte = new SvelteAdapter(kept);
    await svelte.setInStorage(store, "cart");
    const writes = countWrites(kept);

    expect(await svelte.flush("cart")).toBe(true);
    expect(writes).not.toHaveBeenCalled();
    store.set({ items: 2 });

    expect(await svelte.flush("cart")).toBe(true);
    expect(await kept.get("cart")).toEqual({ items: 2 });
    expect(writes).toHaveBeenCalledTimes(1);
  });
});

describe("flush — expiration (timeout)", () => {
  it("a state already stored: the expiration is not renewed", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user", { timeout: 60_000 });
    const expires = await kept.getExpire("user");
    await new Promise((resolve) => setTimeout(resolve, 15));

    await react.flush("user");

    expect(await kept.getExpire("user")).toBe(expires);
  });

  it("a change: written with its expiration", async () => {
    freshStorage("LocalStorageAdapter");
    const kept = openStorage("LocalStorageAdapter");
    const store = lateStore({ name: "Ana" });
    const react = new ReactAdapter(kept);
    await react.setInStorage(store, "user", { timeout: 60_000 });
    const expires = await kept.getExpire("user");
    await new Promise((resolve) => setTimeout(resolve, 15));

    store.setState({ name: "Bia" });
    await react.flush("user");

    expect(await kept.getExpire("user")).toBeGreaterThan(expires);
  });
});

describe("flush — two tabs", () => {
  /** Two tabs of one app on IndexedDB, with sync between them */
  function twoTabs() {
    freshStorage("IndexedDBAdapter");
    const channelName = uniqueChannel();
    const tab = () => openStorage("IndexedDBAdapter", { channelName, enableSyncTabs: true });
    return { here: tab(), there: tab() };
  }

  it("a flush in one tab reaches the other once", async () => {
    const { here, there } = twoTabs();
    const mine = piniaStore();
    const theirs = piniaStore();
    const piniaHere = new PiniaAdapter(here);
    await piniaHere.setInStorage(mine, "user", { syncTabs: true });
    await new PiniaAdapter(there).setInStorage(theirs, "user", { syncTabs: true });
    await settle();
    const heard = [];
    there.onDataChanged((change) => heard.push(change.key));

    mine.name = "Bia";
    await piniaHere.flush("user");
    await settle();

    expect(theirs.name).toBe("Bia");
    expect(heard).toEqual(["user"]);
  });

  it("a change of the other tab, applied here, is not written back by a flush here", async () => {
    const { here, there } = twoTabs();
    const mine = piniaStore();
    const theirs = piniaStore();
    const piniaHere = new PiniaAdapter(here);
    const piniaThere = new PiniaAdapter(there);
    await piniaHere.setInStorage(mine, "user", { syncTabs: true });
    await piniaThere.setInStorage(theirs, "user", { syncTabs: true });
    await settle();

    theirs.name = "Bia";
    await piniaThere.flush("user");
    await settle();
    expect(mine.name).toBe("Bia");
    const writes = countWrites(here);

    expect(await piniaHere.flush("user")).toBe(true);
    expect(writes).not.toHaveBeenCalled();
  });
});
