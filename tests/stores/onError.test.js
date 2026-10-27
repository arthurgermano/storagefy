import { describe, it, expect, beforeEach, vi } from "vitest";
import { Window } from "happy-dom";
import { sleep } from "misc-helpers";
import { setActivePinia, createPinia, defineStore } from "pinia";
import { writable } from "svelte/store";
import { create } from "zustand";
import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";
import SvelteAdapter from "../../src/stores/SvelteAdapter.js";
import ReactAdapter from "../../src/stores/ReactAdapter.js";

// ------------------------------------------------------------------------------------------------
// options.onError: every failed write of a store reaches the app — the storage adapters answer false instead of
// throwing, and a failure after the first write used to be lost (the promise was already settled).
// ------------------------------------------------------------------------------------------------

/** Lets the store's subscription run its write */
const settle = () => sleep(20);

const useCounterStore = defineStore("counter", { state: () => ({ count: 0 }) });

/** Each store library: make a store, persist it, change it */
const stores = {
  Pinia: {
    persist: async (storage, options) => {
      setActivePinia(createPinia());
      const store = useCounterStore();
      await new PiniaAdapter(storage).setInStorage(store, "counter", options);
      return (count) => store.$patch({ count });
    },
  },
  Svelte: {
    persist: async (storage, options) => {
      const store = writable({ count: 0 });
      await new SvelteAdapter(storage).setInStorage(store, "counter", options);
      return (count) => store.set({ count });
    },
  },
  React: {
    persist: async (storage, options) => {
      const store = create(() => ({ count: 0 }));
      await new ReactAdapter(storage).setInStorage(store, "counter", options);
      return (count) => store.setState({ count });
    },
  },
};

describe.each(Object.keys(stores))("%s — onError", (name) => {
  let storage;

  beforeEach(() => {
    global.localStorage = new Window().localStorage;
    storage = new LocalStorageAdapter({ dbName: "errDB", encrypt: false, expireCheckInterval: 0 });
  });

  it("is not called while writes succeed", async () => {
    const onError = vi.fn();
    const change = await stores[name].persist(storage, { onError });
    change(1);
    await settle();

    expect(onError).not.toHaveBeenCalled();
    expect(await storage.get("counter")).toEqual({ count: 1 });
  });

  it("is told when a later write is not saved (the storage answers false)", async () => {
    const onError = vi.fn();
    const change = await stores[name].persist(storage, { onError });
    vi.spyOn(storage, "set").mockResolvedValue(false);

    change(2);
    await settle();

    expect(onError).toHaveBeenCalled();
    const [error] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Storagefy: could not save "counter"');
  });

  it("is told when a later write throws — with the error as the cause", async () => {
    const onError = vi.fn();
    const change = await stores[name].persist(storage, { onError });
    const quota = new Error("QuotaExceededError");
    vi.spyOn(storage, "set").mockRejectedValue(quota);

    change(3);
    await settle();

    expect(onError).toHaveBeenCalled();
    expect(onError.mock.calls[0][0].cause).toBe(quota);
  });

  it("keeps the store working without onError — a failed write throws nothing", async () => {
    const change = await stores[name].persist(storage, {});
    vi.spyOn(storage, "set").mockResolvedValue(false);

    expect(() => change(4)).not.toThrow();
    await settle();
  });

  it("keeps the store working when onError itself throws", async () => {
    const onError = vi.fn(() => {
      throw new Error("bug in the app's handler");
    });
    const change = await stores[name].persist(storage, { onError });
    const set = vi.spyOn(storage, "set").mockResolvedValueOnce(false);

    change(5);
    await settle();
    set.mockRestore();
    change(6);
    await settle();

    expect(onError).toHaveBeenCalled();
    expect(await storage.get("counter")).toEqual({ count: 6 });
  });
});
