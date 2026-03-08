import { describe, it, beforeEach, expect } from "vitest";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { createStore as createReduxStore } from "redux";
import { create } from "zustand";
import { atom, createStore as createJotaiInternalStore } from "jotai";
import React from "react";

import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";
import ReactAdapter from "../../src/stores/ReactAdapter.js";

// ------------------------------------------------------------------------------------------------

function setReduxStore() {
  const initialState = {
    name: "Alice",
    age: 25,
    secret: "classified",
    token: "abc123",
    nested: {
      password: "supersecret",
      username: "alice",
      deep: {
        apiKey: "key-999",
        label: "visible",
      },
    },
  };

  function reducer(state = initialState, action) {
    if (
      action.type === "SET_STATE_FROM_STORAGE" ||
      action.type === "STORAGEFY_UPDATE"
    ) {
      return { ...state, ...action.payload };
    }
    return state;
  }

  return createReduxStore(reducer);
}

const setZustandStore = () =>
  create((set) => ({
    name: "Alice",
    age: 25,
    secret: "classified",
    token: "abc123",
    nested: {
      password: "supersecret",
      username: "alice",
      deep: {
        apiKey: "key-999",
        label: "visible",
      },
    },
    setState: (newState) => set(newState),
  }));

const setCustomStore = () => {
  let state = {
    name: "Alice",
    age: 25,
    secret: "classified",
    token: "abc123",
    nested: {
      password: "supersecret",
      username: "alice",
      deep: {
        apiKey: "key-999",
        label: "visible",
      },
    },
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

function setJotaiStore() {
  const jotaiStore = createJotaiInternalStore();
  const stateAtom = atom({
    name: "Alice",
    age: 25,
    secret: "classified",
    token: "abc123",
    nested: {
      password: "supersecret",
      username: "alice",
      deep: {
        apiKey: "key-999",
        label: "visible",
      },
    },
  });

  const getState = () => jotaiStore.get(stateAtom);
  const setState = (newState) => {
    jotaiStore.set(stateAtom, { ...jotaiStore.get(stateAtom), ...newState });
  };
  const subscribe = (callback) =>
    jotaiStore.sub(stateAtom, () => callback(jotaiStore.get(stateAtom)));

  return { getState, setState, subscribe };
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
    return new LocalStorageAdapter({ dbName: "testDB-ignore", encrypt: false });
  },

  SessionStorageAdapter: () => {
    const window = new Window();
    global.sessionStorage = window.sessionStorage;
    return new SessionStorageAdapter({
      dbName: "testDB-ignore",
      encrypt: false,
    });
  },

  IndexedDBAdapter: async () => {
    const window = new Window();
    const indexedDB = new IDBFactory();
    window.indexedDB = indexedDB;
    global.indexedDB = window.indexedDB;
    return new IndexedDBAdapter({ dbName: "testDB-ignore", encrypt: false });
  },
};

// ------------------------------------------------------------------------------------------------

describe.each(Object.entries(adapterSetups))(
  "ReactAdapter omitKeys + %s",
  (name, setupAdapter) => {
    let adapter, reactAdapter;

    beforeEach(async () => {
      adapter =
        typeof setupAdapter === "function"
          ? await setupAdapter()
          : setupAdapter;
      reactAdapter = new ReactAdapter(adapter);
    });

    describe.each([
      ["Redux", () => reduxStore],
      ["Zustand", () => zustandStore],
      ["Custom", () => customStore],
      ["Jotai", () => jotaiStore],
    ])("with %s store", (storeName, getStore) => {
      let store;

      beforeEach(() => {
        store = getStore();
      });

      // ── Flat keys (comportamento original) ──────────────────────────────

      it("should ignore a single flat key", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["secret"],
        });

        const data = await adapter.get("test-key");
        expect(data.secret).toBeUndefined();
        expect(data.name).toBe("Alice");
        expect(data.age).toBe(25);
      });

      it("should ignore multiple flat keys", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["secret", "token"],
        });

        const data = await adapter.get("test-key");
        expect(data.secret).toBeUndefined();
        expect(data.token).toBeUndefined();
        expect(data.name).toBe("Alice");
      });

      it("should persist all keys when ignoreKeys is empty", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: [],
        });

        const data = await adapter.get("test-key");
        expect(data.secret).toBe("classified");
        expect(data.token).toBe("abc123");
        expect(data.name).toBe("Alice");
      });

      it("should persist all keys when ignoreKeys is not provided", async () => {
        await reactAdapter.setInStorage(store, "test-key");

        const data = await adapter.get("test-key");
        expect(data.secret).toBe("classified");
        expect(data.token).toBe("abc123");
        expect(data.name).toBe("Alice");
      });

      it("should not affect keys not listed in ignoreKeys", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["secret"],
        });

        const data = await adapter.get("test-key");
        expect(data.name).toBe("Alice");
        expect(data.age).toBe(25);
        expect(data.token).toBe("abc123");
      });

      // ── Nested keys (nova funcionalidade) ────────────────────────────────

      it("should ignore a single nested key (dot notation)", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["nested.password"],
        });

        const data = await adapter.get("test-key");
        expect(data.nested.password).toBeUndefined();
        expect(data.nested.username).toBe("alice");
      });

      it("should ignore multiple nested keys", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["nested.password", "nested.username"],
        });

        const data = await adapter.get("test-key");
        expect(data.nested.password).toBeUndefined();
        expect(data.nested.username).toBeUndefined();
        expect(data.nested.deep.label).toBe("visible");
      });

      it("should ignore a deeply nested key", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["nested.deep.apiKey"],
        });

        const data = await adapter.get("test-key");
        expect(data.nested.deep.apiKey).toBeUndefined();
        expect(data.nested.deep.label).toBe("visible");
      });

      it("should ignore mix of flat and nested keys", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["secret", "nested.password", "nested.deep.apiKey"],
        });

        const data = await adapter.get("test-key");
        expect(data.secret).toBeUndefined();
        expect(data.nested.password).toBeUndefined();
        expect(data.nested.deep.apiKey).toBeUndefined();
        expect(data.name).toBe("Alice");
        expect(data.nested.username).toBe("alice");
        expect(data.nested.deep.label).toBe("visible");
      });

      it("should not affect sibling keys when ignoring a nested key", async () => {
        await reactAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["nested.password"],
        });

        const data = await adapter.get("test-key");
        expect(data.nested.username).toBe("alice");
        expect(data.nested.deep.apiKey).toBe("key-999");
        expect(data.nested.deep.label).toBe("visible");
      });

      it("should not throw when ignoreKeys contains a non-existent nested path", async () => {
        await expect(
          reactAdapter.setInStorage(store, "test-key", {
            ignoreKeys: ["nested.nonExistent", "ghost.path"],
          })
        ).resolves.not.toThrow();

        const data = await adapter.get("test-key");
        expect(data.nested.username).toBe("alice");
      });
    });
  }
);