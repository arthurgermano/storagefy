import { describe, it, beforeEach, expect, vi } from "vitest";
import { setActivePinia, createPinia, defineStore } from "pinia";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { sleep } from "misc-helpers";

import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";

// ------------------------------------------------------------------------------------------------

const useTestStore = defineStore("test", {
  state: () => ({
    name: "Alice",
    age: 25,
    secret: "classified",
  }),
});

let store;

beforeEach(() => {
  setActivePinia(createPinia());
  store = useTestStore();
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
  "PiniaAdapter + %s",
  (name, setupAdapter) => {
    let adapter, piniaAdapter;

    // --------------------------------------------------------------------------------------------

    beforeEach(async () => {
      adapter =
        typeof setupAdapter === "function"
          ? await setupAdapter()
          : setupAdapter;
      piniaAdapter = new PiniaAdapter(adapter);
    });

    // --------------------------------------------------------------------------------------------

    it("should persist the store state (ignoring specified keys)", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret"],
      });

      const storedData = await adapter.get("test-key");

      expect(storedData).toEqual({
        name: "Alice",
        age: 25,
        secret: undefined,
      });
    });

    // --------------------------------------------------------------------------------------------

    it("should restore store state from storage", async () => {
      await adapter.set("test-key", {
        name: "Bob",
        age: 30,
      });

      await piniaAdapter.getFromStorage(store, "test-key");

      expect(store.name).toBe("Bob");
      expect(store.age).toBe(30);
    });

    // --------------------------------------------------------------------------------------------

    it("should not patch the store if no data is found", async () => {
      const patchSpy = vi.spyOn(store, "$patch");
      await piniaAdapter.getFromStorage(store, "missing-key");

      expect(patchSpy).not.toHaveBeenCalled();
    });

    // --------------------------------------------------------------------------------------------

    it("should clean up subscription on destroy", async () => {
      await piniaAdapter.setInStorage(store, "test-key");
      expect(piniaAdapter._unsubscribe).toHaveProperty("test-key");

      piniaAdapter.destroy("test-key");
      expect(piniaAdapter._unsubscribe).not.toHaveProperty("test-key");
    });

    // --------------------------------------------------------------------------------------------

    it("should set the store as an expiring key in storage", async () => {
      await piniaAdapter.setInStorage(store, "test-key", { timeout: 150 });

      const raw = await adapter.getExpire("test-key");

      expect(raw).toBeDefined();
      expect(typeof raw).toBe("number");

      const currentTime = Date.now();
      expect(raw).toBeGreaterThan(currentTime);
      expect(raw).toBeLessThan(currentTime + 200);
    });

    // --------------------------------------------------------------------------------------------

    it("should ignore keys specified in the options", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret"],
      });

      const data = await adapter.get("test-key");
      expect(data.secret).toBe(undefined);
      expect(data.name).toBe("Alice");
    });

    // --------------------------------------------------------------------------------------------

    it("should return undefined for a non-existent key", async () => {
      const result = await piniaAdapter.getFromStorage(store, "non-existent");
      expect(result).toBeUndefined();
    });

    // --------------------------------------------------------------------------------------------

    it("should not patch the store if key does not exist in storage", async () => {
      const patchSpy = vi.spyOn(store, "$patch");

      await piniaAdapter.getFromStorage(store, "missing-key");
      expect(patchSpy).not.toHaveBeenCalled();
    });

    // --------------------------------------------------------------------------------------------

    it("should set and retrieve the same store data", async () => {
      await piniaAdapter.setInStorage(store, "test-key");
      store.$patch({ name: "Modified", age: 50 }); // mutate local store

      await piniaAdapter.getFromStorage(store, "test-key");
      expect(store.name).toBe("Alice");
      expect(store.age).toBe(25);
    });

    // --------------------------------------------------------------------------------------------

    it("should throw an error when store is not defined", async () => {
      await expect(() =>
        piniaAdapter.setInStorage(null, "test-key")
      ).rejects.toThrow("Store provided is not defined");

      await expect(() =>
        piniaAdapter.getFromStorage(undefined, "test-key")
      ).rejects.toThrow("Store provided is not defined");
    });

    // --------------------------------------------------------------------------------------------

    it("should not return expired data", async () => {
      await piniaAdapter.setInStorage(store, "test-key", { timeout: 50 });
      await sleep(150); // wait for expiry
      const result = await adapter.get("test-key");
      expect(result).toBeNull();
    });

    // --------------------------------------------------------------------------------------------

    it("should support multiple stores without conflict", async () => {
      const useOtherStore = defineStore("other", {
        state: () => ({ value: 123 }),
      });
      const otherStore = useOtherStore();

      await piniaAdapter.setInStorage(store, "store-A");
      await piniaAdapter.setInStorage(otherStore, "store-B");

      const dataA = await adapter.get("store-A");
      const dataB = await adapter.get("store-B");

      expect(dataA).not.toEqual(dataB);
    });

    // --------------------------------------------------------------------------------------------

    it("should update expiration time when key is overwritten", async () => {
      await piniaAdapter.setInStorage(store, "temp-key", { timeout: 150 });
      await sleep(100);
      await piniaAdapter.setInStorage(store, "temp-key", { timeout: 200 });

      const expireTime = await adapter.getExpire("temp-key");
      expect(expireTime).toBeGreaterThan(Date.now() + 100);
    });

    // --------------------------------------------------------------------------------------------

    it("should update the value in store when the pinia store is updated", async () => {
      await piniaAdapter.setInStorage(store, "test-key");
      store.name = "Bob";
      store.age = 30;

      await sleep(10);
      const data = await adapter.get("test-key");
      expect(data.name).toBe("Bob");
      expect(data.age).toBe(30);
    });
  }
);
