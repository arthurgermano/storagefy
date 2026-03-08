import { describe, it, beforeEach, expect } from "vitest";
import { setActivePinia, createPinia, defineStore } from "pinia";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";

// ------------------------------------------------------------------------------------------------

const useTestStore = defineStore("test-ignore-keys", {
  state: () => ({
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
  "omitKeys + %s",
  (name, setupAdapter) => {
    let adapter, piniaAdapter;

    beforeEach(async () => {
      adapter =
        typeof setupAdapter === "function"
          ? await setupAdapter()
          : setupAdapter;
      piniaAdapter = new PiniaAdapter(adapter);
    });

    // ── Flat keys (comportamento original) ────────────────────────────────

    it("should ignore a single flat key", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret"],
      });

      const data = await adapter.get("test-key");
      expect(data.secret).toBeUndefined();
      expect(data.name).toBe("Alice");
      expect(data.age).toBe(25);
    });

    it("should ignore multiple flat keys", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret", "token"],
      });

      const data = await adapter.get("test-key");
      expect(data.secret).toBeUndefined();
      expect(data.token).toBeUndefined();
      expect(data.name).toBe("Alice");
    });

    it("should persist all keys when ignoreKeys is empty", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: [],
      });

      const data = await adapter.get("test-key");
      expect(data.secret).toBe("classified");
      expect(data.token).toBe("abc123");
      expect(data.name).toBe("Alice");
    });

    it("should persist all keys when ignoreKeys is not provided", async () => {
      await piniaAdapter.setInStorage(store, "test-key");

      const data = await adapter.get("test-key");
      expect(data.secret).toBe("classified");
      expect(data.token).toBe("abc123");
      expect(data.name).toBe("Alice");
    });

    it("should not affect keys not listed in ignoreKeys", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret"],
      });

      const data = await adapter.get("test-key");
      expect(data.name).toBe("Alice");
      expect(data.age).toBe(25);
      expect(data.token).toBe("abc123");
    });

    // ── Nested keys (nova funcionalidade) ─────────────────────────────────

    it("should ignore a single nested key (dot notation)", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.password"],
      });

      const data = await adapter.get("test-key");
      expect(data.nested.password).toBeUndefined();
      expect(data.nested.username).toBe("alice");
    });

    it("should ignore multiple nested keys", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.password", "nested.username"],
      });

      const data = await adapter.get("test-key");
      expect(data.nested.password).toBeUndefined();
      expect(data.nested.username).toBeUndefined();
      expect(data.nested.deep.label).toBe("visible");
    });

    it("should ignore a deeply nested key", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.deep.apiKey"],
      });

      const data = await adapter.get("test-key");
      expect(data.nested.deep.apiKey).toBeUndefined();
      expect(data.nested.deep.label).toBe("visible");
    });

    it("should ignore mix of flat and nested keys", async () => {
      await piniaAdapter.setInStorage(store, "test-key", {
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
      await piniaAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.password"],
      });

      const data = await adapter.get("test-key");
      expect(data.nested.username).toBe("alice");
      expect(data.nested.deep.apiKey).toBe("key-999");
      expect(data.nested.deep.label).toBe("visible");
    });

    it("should not throw when ignoreKeys contains a non-existent nested path", async () => {
      await expect(
        piniaAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["nested.nonExistent", "ghost.path"],
        })
      ).resolves.not.toThrow();

      const data = await adapter.get("test-key");
      expect(data.nested.username).toBe("alice");
    });

    // ── omitKeys direto na classe pai ─────────────────────────────────────

    it("should return same object structure with flat key set to undefined", () => {
      const result = piniaAdapter.omitKeys(
        { name: "Alice", secret: "classified" },
        ["secret"]
      );
      expect(result.secret).toBeUndefined();
      expect(result.name).toBe("Alice");
    });

    it("should return same object structure with nested key set to undefined", () => {
      const result = piniaAdapter.omitKeys(
        { user: { password: "123", name: "Alice" } },
        ["user.password"]
      );
      expect(result.user.password).toBeUndefined();
      expect(result.user.name).toBe("Alice");
    });

    it("should return original object when ignoreKeys is empty", () => {
      const obj = { name: "Alice", secret: "classified" };
      const result = piniaAdapter.omitKeys(obj, []);
      expect(result).toEqual(obj);
    });

    it("should return original value when obj is not an object", () => {
      expect(piniaAdapter.omitKeys(null, ["key"])).toBeNull();
      expect(piniaAdapter.omitKeys(undefined, ["key"])).toBeUndefined();
      expect(piniaAdapter.omitKeys("string", ["key"])).toBe("string");
    });

    it("should not mutate the original object", () => {
      const original = { name: "Alice", secret: "classified" };
      piniaAdapter.omitKeys(original, ["secret"]);
      expect(original.secret).toBe("classified");
    });
  }
);