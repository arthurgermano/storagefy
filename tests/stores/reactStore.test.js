import { describe, it, beforeEach, expect, vi } from "vitest";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { sleep } from "misc-helpers";
import { createStore as createReduxStore } from "redux";
import { create } from "zustand";
import { atom, createStore as createJotaiInternalStore } from "jotai";
import React from "react";

import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";
import ReactAdapter from "../../src/stores/ReactAdapter.js";

// ------------------------------------------------------------------------------------------------

// Redux store setup
function setReduxStore() {
  const initialState = {
    name: "Alice",
    age: 25,
    secret: "classified",
  };

  function reducer(state = initialState, action) {
    if (action.type === "SET_STATE_FROM_STORAGE") {
      return { ...state, ...action.payload };
    }
    return state;
  }

  return createReduxStore(reducer);
}

// Zustand store setup
const setZustandStore = () => {
  return create((set) => ({
    name: "Alice",
    age: 25,
    secret: "classified",
    setState: (newState) => set(newState),
  }));
};

// Custom useState with subscribe
const setCustomStore = () => {
  let state = {
    name: "Alice",
    age: 25,
    secret: "classified",
  };

  const subscribers = new Set();

  const subscribe = (callback) => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  };

  const setState = (newState) => {
    state = { ...state, ...newState };
    subscribers.forEach((cb) => cb(state));
  };

  const getState = () => state;

  return { getState, setState, subscribe };
};

// Jotai Store Wrapper
function setJotaiStore() {
  const jotaiStore = createJotaiInternalStore();

  const stateAtom = atom({
    name: "Alice",
    age: 25,
    secret: "classified",
  });

  const getState = () => jotaiStore.get(stateAtom);
  const setState = (newState) => {
    jotaiStore.set(stateAtom, {
      ...jotaiStore.get(stateAtom),
      ...newState,
    });
  };

  const subscribe = (callback) => {
    return jotaiStore.sub(stateAtom, () => {
      callback(jotaiStore.get(stateAtom));
    });
  };

  return {
    getState,
    setState,
    subscribe,
  };
}

let reduxStore, zustandStore, customStore, jotaiStore;

beforeEach(() => {
  reduxStore = setReduxStore();
  zustandStore = setZustandStore();
  customStore = setCustomStore();
  jotaiStore = setJotaiStore();
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
  "ReactAdapter + %s",
  (name, setupAdapter) => {
    let adapter, reactAdapter;

    // --------------------------------------------------------------------------------------------

    beforeEach(async () => {
      adapter =
        typeof setupAdapter === "function"
          ? await setupAdapter()
          : setupAdapter;
      reactAdapter = new ReactAdapter(adapter);
    });

    // --------------------------------------------------------------------------------------------

    describe.each([
      ["Redux", () => reduxStore],
      ["Zustand", () => zustandStore],
      ["Custom", () => customStore],
      ["Jotai", () => jotaiStore], // ← Add this
    ])("with %s store", (storeName, getStore) => {
      let store;
      beforeEach(() => {
        store = getStore();
      });

      // ------------------------------------------------------------------------------------------

      it("should persist the store state (ignoring specified keys)", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["secret"],
        });

        const storedData = await adapter.get("test-key");

        expect(storedData).toEqual({
          name: "Alice",
          age: 25,
          secret: undefined,
        });
      });

      // ------------------------------------------------------------------------------------------

      it("should restore store state from storage", async () => {
        await adapter.set("test-key", {
          name: "Bob",
          age: 30,
        });

        await reactAdapter.getFromStorage(store, "test-key");

        let storeObj;

        if (storeName === "Redux") {
          storeObj = reduxStore;
        } else if (storeName === "Zustand") {
          storeObj = zustandStore;
        } else if (storeName === "Custom") {
          storeObj = customStore;
        } else if (storeName === "Jotai") {
          storeObj = jotaiStore;
        }

        expect(storeObj.getState().name).toBe("Bob");
        expect(storeObj.getState().age).toBe(30);
      });

      // ------------------------------------------------------------------------------------------

      it("should not update the store if no data is found", async () => {
        let updateSpy;

        let storeObj;
        if (storeName === "Redux") {
          storeObj = reduxStore;
          updateSpy = vi.spyOn(store, "dispatch");
        } else if (storeName === "Zustand") {
          storeObj = zustandStore;
        } else if (storeName === "Custom") {
          storeObj = customStore;
        } else if (storeName === "Jotai") {
          storeObj = jotaiStore;
        }

        if (storeName !== "Redux") {
          updateSpy = vi.spyOn(store, "setState");
        }

        await reactAdapter.getFromStorage(store, "missing-key");
        expect(updateSpy).not.toHaveBeenCalled();
      });

      // ------------------------------------------------------------------------------------------

      it("should clean up subscription on destroy", async () => {
        await reactAdapter.setInStorage(store, "test-key");

        const unsubSpy = vi.fn();
        reactAdapter._unsubscribe = unsubSpy;

        reactAdapter.destroy();
        expect(unsubSpy).toHaveBeenCalled();
        expect(reactAdapter._unsubscribe).toBe(null);
      });

      // ------------------------------------------------------------------------------------------

      it("should set the store as an expiring key in storage", async () => {
        await reactAdapter.setInStorage(store, "test-key", { timeout: 200 });
        await sleep(10);
        const raw = await adapter.getExpire("test-key");

        expect(raw).toBeDefined();
        expect(typeof raw).toBe("number");

        const currentTime = Date.now();
        expect(raw).toBeGreaterThan(currentTime);
        expect(raw).toBeLessThan(currentTime + 200);
      });

      // ------------------------------------------------------------------------------------------

      it("should ignore keys specified in the options", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["secret"],
        });

        const data = await adapter.get("test-key");
        expect(data.secret).toBe(undefined);
        expect(data.name).toBe("Alice");
      });

      // ------------------------------------------------------------------------------------------

      it("should return undefined for a non-existent key", async () => {
        const result = await reactAdapter.getFromStorage(store, "non-existent");
        expect(result).toBeUndefined();
      });

      // ------------------------------------------------------------------------------------------

      it("should set and retrieve the same store data", async () => {
        await reactAdapter.setInStorage(store, "test-key");

        let storeObj;
        if (storeName === "Redux") {
          storeObj = reduxStore;
        } else if (storeName === "Zustand") {
          storeObj = zustandStore;
        } else if (storeName === "Custom") {
          storeObj = customStore;
        } else if (storeName === "Jotai") {
          storeObj = jotaiStore;
        }

        // Update the store
        if (storeName === "Redux") {
          storeObj.dispatch({
            type: "SET_STATE_FROM_STORAGE",
            payload: { name: "Modified", age: 50 },
          });
        } else {
          storeObj.setState({ name: "Modified", age: 50 });
        }

        await reactAdapter.getFromStorage(store, "test-key");

        expect(storeObj.getState().name).toBe("Alice");
        expect(storeObj.getState().age).toBe(25);
      });

      // ------------------------------------------------------------------------------------------

      it("should throw an error when store is not defined", async () => {
        await expect(() =>
          reactAdapter.setInStorage(null, "test-key")
        ).rejects.toThrow("Store provided is not defined");

        await expect(() =>
          reactAdapter.getFromStorage(undefined, "test-key")
        ).rejects.toThrow("Store provided is not defined");
      });

      // ------------------------------------------------------------------------------------------

      it("should not return expired data", async () => {
        await reactAdapter.setInStorage(store, "test-key", { timeout: 50 });
        await sleep(150); // wait for expiry
        const result = await adapter.get("test-key");
        expect(result).toBeNull();
      });

      // ------------------------------------------------------------------------------------------

      it("should update expiration time when key is overwritten", async () => {
        await reactAdapter.setInStorage(store, "temp-key", { timeout: 150 });
        await sleep(100);
        await reactAdapter.setInStorage(store, "temp-key", { timeout: 300 });
        await sleep(100);
        const expireTime = await adapter.getExpire("temp-key");
        expect(expireTime).toBeGreaterThan(Date.now() + 100);
      });

      // ------------------------------------------------------------------------------------------

      it("should update the value in store when the store is updated", async () => {
        await reactAdapter.setInStorage(store, "test-key");

        let storeObj;
        if (storeName === "Redux") {
          storeObj = reduxStore;
          storeObj.dispatch({
            type: "SET_STATE_FROM_STORAGE",
            payload: { name: "Bob", age: 30 },
          });
        } else if (storeName === "Zustand") {
          storeObj = zustandStore;
        } else if (storeName === "Custom") {
          storeObj = customStore;
        } else if (storeName === "Jotai") {
          storeObj = jotaiStore;
        }

        const dataBF = await adapter.get("test-key");
        expect(dataBF.name).toBe("Alice");
        expect(dataBF.age).toBe(25);

        // Update the store
        if (storeName !== "Redux") {
          storeObj.setState({ name: "Bob", age: 30 });
        }

        await sleep(10);
        const data = await adapter.get("test-key");
        expect(data.name).toBe("Bob");
        expect(data.age).toBe(30);
      });
    });
  }
);
