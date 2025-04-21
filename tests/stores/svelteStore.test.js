import { describe, it, beforeEach, expect, vi } from "vitest";
import { writable, get } from "svelte/store";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { sleep } from "misc-helpers";

import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";
import SvelteAdapter from "../../src/stores/SvelteAdapter.js";

// ------------------------------------------------------------------------------------------------

let store;

const createTestStore = () =>
  writable({
    name: "Alice",
    age: 25,
    secret: "classified",
  });

// ------------------------------------------------------------------------------------------------

const adapterSetups = {
  LocalStorageAdapter: () => {
    const window = new Window();
    global.localStorage = window.localStorage;
    return new LocalStorageAdapter({
      dbName: "testDB",
      encrypt: false,
      expireCheckInterval: 50,
    });
  },

  SessionStorageAdapter: () => {
    const window = new Window();
    global.sessionStorage = window.sessionStorage;
    return new SessionStorageAdapter({
      dbName: "testDB",
      encrypt: false,
      expireCheckInterval: 50,
    });
  },

  IndexedDBAdapter: async () => {
    const window = new Window();
    const indexedDB = new IDBFactory();
    window.indexedDB = indexedDB;
    global.indexedDB = window.indexedDB;

    const adapter = new IndexedDBAdapter({
      dbName: "testDB",
      encrypt: false,
      expireCheckInterval: 50,
    });

    return adapter;
  },
};

// ------------------------------------------------------------------------------------------------

describe.each(Object.entries(adapterSetups))(
  "SvelteAdapter + %s",
  (name, setupAdapter) => {
    let adapter, svelteAdapter;

    beforeEach(async () => {
      adapter =
        typeof setupAdapter === "function"
          ? await setupAdapter()
          : setupAdapter;
      svelteAdapter = new SvelteAdapter(adapter);
      store = createTestStore();
    });

    // ----------------------------------------------------------------------------------------------

    it("should persist the store state (ignoring specified keys)", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret"],
      });

      const storedData = await adapter.get("test-key");

      expect(storedData).toEqual({
        name: "Alice",
        age: 25,
        secret: undefined,
      });
    });

    // ----------------------------------------------------------------------------------------------

    it("should restore store state from storage", async () => {
      await adapter.set("test-key", { name: "Bob", age: 30 });

      await svelteAdapter.getFromStorage(store, "test-key");

      expect(get(store)).toMatchObject({ name: "Bob", age: 30 });
    });

    // ----------------------------------------------------------------------------------------------

    it("should not patch the store if no data is found", async () => {
      const spy = vi.fn();
      const unsub = store.subscribe(spy);

      await svelteAdapter.getFromStorage(store, "missing-key");

      expect(spy).toHaveBeenCalledTimes(1); // initial call only
      unsub();
    });

    // ----------------------------------------------------------------------------------------------

    it("should clean up subscription on destroy", async () => {
      await svelteAdapter.setInStorage(store, "test-key");

      const unsubSpy = vi.fn();
      svelteAdapter._unsubscribe = unsubSpy;

      svelteAdapter.destroy();
      expect(unsubSpy).toHaveBeenCalled();
      expect(svelteAdapter._unsubscribe).toBe(null);
    });

    // ----------------------------------------------------------------------------------------------

    it("should set the store as an expiring key in storage", async () => {
      await svelteAdapter.setInStorage(store, "test-key", { timeout: 150 });

      const raw = await adapter.getExpire("test-key");

      expect(raw).toBeDefined();
      expect(typeof raw).toBe("number");

      const now = Date.now();
      expect(raw).toBeGreaterThan(now);
      expect(raw).toBeLessThan(now + 200);
    });

    // ----------------------------------------------------------------------------------------------

    it("should return undefined for a non-existent key", async () => {
      const result = await svelteAdapter.getFromStorage(store, "non-existent");
      expect(result).toBeUndefined();
    });

    // ----------------------------------------------------------------------------------------------

    it("should ignore keys specified in the options", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret"],
      });

      const data = await adapter.get("test-key");
      expect(data.secret).toBe(undefined);
    });

    // ----------------------------------------------------------------------------------------------

    it("should not return expired data", async () => {
      await svelteAdapter.setInStorage(store, "test-key", { timeout: 50 });
      await sleep(150);
      const result = await adapter.get("test-key");
      expect(result).toBeNull();
    });

    // ----------------------------------------------------------------------------------------------

    it("should update expiration time when key is overwritten", async () => {
      await svelteAdapter.setInStorage(store, "temp-key", { timeout: 150 });
      await sleep(100);
      await svelteAdapter.setInStorage(store, "temp-key", { timeout: 200 });

      const expireTime = await adapter.getExpire("temp-key");
      expect(expireTime).toBeGreaterThan(Date.now() + 100);
    });

    // ----------------------------------------------------------------------------------------------

    it("should reflect updated values in storage", async () => {
      await svelteAdapter.setInStorage(store, "test-key");

      store.update((s) => ({ ...s, name: "Bob", age: 30 }));
      await sleep(10);

      const updated = await adapter.get("test-key");
      expect(updated.name).toBe("Bob");
      expect(updated.age).toBe(30);
    });

    // ----------------------------------------------------------------------------------------------

    it("should throw an error when store is not defined", async () => {
      await expect(() =>
        svelteAdapter.setInStorage(null, "test-key")
      ).rejects.toThrow();
      await expect(() =>
        svelteAdapter.getFromStorage(undefined, "test-key")
      ).rejects.toThrow();
    });

    it("should not return expired data", async () => {
      await svelteAdapter.setInStorage(store, "test-key", { timeout: 50 });
      await sleep(150); // wait for expiry
      const result = await adapter.get("test-key");
      expect(result).toBeNull();
    });

    // --------------------------------------------------------------------------------------------

    it("should support multiple stores without conflict", async () => {
      const otherStore = writable({ value: 123 });

      await svelteAdapter.setInStorage(store, "store-A");
      await svelteAdapter.setInStorage(otherStore, "store-B");

      const dataA = await adapter.get("store-A");
      const dataB = await adapter.get("store-B");

      expect(dataA).not.toEqual(dataB);
    });

    // --------------------------------------------------------------------------------------------

    it("should update expiration time when key is overwritten", async () => {
      await svelteAdapter.setInStorage(store, "temp-key", { timeout: 150 });
      await sleep(100);
      await svelteAdapter.setInStorage(store, "temp-key", { timeout: 200 });

      const expireTime = await adapter.getExpire("temp-key");
      expect(expireTime).toBeGreaterThan(Date.now() + 100);
    });

    // --------------------------------------------------------------------------------------------

    it("should update the value in store when the pinia store is updated", async () => {
      await svelteAdapter.setInStorage(store, "test-key");
      store.update((state) => ({
        ...state,
        name: "Bob",
        age: 30,
      }));

      await sleep(10);
      const data = await adapter.get("test-key");
      expect(data.name).toBe("Bob");
      expect(data.age).toBe(30);
    });
  }
);
