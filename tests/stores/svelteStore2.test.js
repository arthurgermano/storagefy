import { describe, it, beforeEach, expect } from "vitest";
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

const createTestStore = () =>
  writable({
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

let store;

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
  "SvelteAdapter omitKeys + %s",
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

    // ── Flat keys (comportamento original) ──────────────────────────────

    it("should ignore a single flat key", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret"],
      });

      const data = await adapter.get("test-key");
      expect(data.secret).toBeUndefined();
      expect(data.name).toBe("Alice");
      expect(data.age).toBe(25);
    });

    it("should ignore multiple flat keys", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret", "token"],
      });

      const data = await adapter.get("test-key");
      expect(data.secret).toBeUndefined();
      expect(data.token).toBeUndefined();
      expect(data.name).toBe("Alice");
    });

    it("should persist all keys when ignoreKeys is empty", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: [],
      });

      const data = await adapter.get("test-key");
      expect(data.secret).toBe("classified");
      expect(data.token).toBe("abc123");
      expect(data.name).toBe("Alice");
    });

    it("should persist all keys when ignoreKeys is not provided", async () => {
      await svelteAdapter.setInStorage(store, "test-key");

      const data = await adapter.get("test-key");
      expect(data.secret).toBe("classified");
      expect(data.token).toBe("abc123");
      expect(data.name).toBe("Alice");
    });

    it("should not affect keys not listed in ignoreKeys", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["secret"],
      });

      const data = await adapter.get("test-key");
      expect(data.name).toBe("Alice");
      expect(data.age).toBe(25);
      expect(data.token).toBe("abc123");
    });

    // ── Nested keys (nova funcionalidade) ────────────────────────────────

    it("should ignore a single nested key (dot notation)", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.password"],
      });

      const data = await adapter.get("test-key");
      expect(data.nested.password).toBeUndefined();
      expect(data.nested.username).toBe("alice");
    });

    it("should ignore multiple nested keys", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.password", "nested.username"],
      });

      const data = await adapter.get("test-key");
      expect(data.nested.password).toBeUndefined();
      expect(data.nested.username).toBeUndefined();
      expect(data.nested.deep.label).toBe("visible");
    });

    it("should ignore a deeply nested key", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.deep.apiKey"],
      });

      const data = await adapter.get("test-key");
      expect(data.nested.deep.apiKey).toBeUndefined();
      expect(data.nested.deep.label).toBe("visible");
    });

    it("should ignore mix of flat and nested keys", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
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
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.password"],
      });

      const data = await adapter.get("test-key");
      expect(data.nested.username).toBe("alice");
      expect(data.nested.deep.apiKey).toBe("key-999");
      expect(data.nested.deep.label).toBe("visible");
    });

    it("should not throw when ignoreKeys contains a non-existent nested path", async () => {
      await expect(
        svelteAdapter.setInStorage(store, "test-key", {
          ignoreKeys: ["nested.nonExistent", "ghost.path"],
        })
      ).resolves.not.toThrow();

      const data = await adapter.get("test-key");
      expect(data.nested.username).toBe("alice");
    });

    it("should reflect nested key omission after store update", async () => {
      await svelteAdapter.setInStorage(store, "test-key", {
        ignoreKeys: ["nested.password"],
      });

      store.update((s) => ({
        ...s,
        nested: { ...s.nested, password: "newpassword", username: "bob" },
      }));

      await sleep(20);

      const data = await adapter.get("test-key");
      expect(data.nested.password).toBeUndefined();
      expect(data.nested.username).toBe("bob");
    });
  }
);