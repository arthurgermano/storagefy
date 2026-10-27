import { describe, it, expect, beforeEach } from "vitest";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";

// ------------------------------------------------------------------------------------------------
// set(key, null | undefined) removes the key — in every adapter, with and without encryption.
// The key used to be prefixed twice on its way to delete(), so the old value stayed stored.
// ------------------------------------------------------------------------------------------------

const adapters = {
  LocalStorageAdapter: (encrypt) => {
    global.localStorage = new Window().localStorage;
    return new LocalStorageAdapter({ dbName: "nullDB", encrypt, expireCheckInterval: 0 });
  },
  SessionStorageAdapter: (encrypt) => {
    global.sessionStorage = new Window().sessionStorage;
    return new SessionStorageAdapter({ dbName: "nullDB", encrypt, expireCheckInterval: 0 });
  },
  IndexedDBAdapter: (encrypt) => {
    global.indexedDB = new IDBFactory();
    return new IndexedDBAdapter({ dbName: "nullDB", encrypt, expireCheckInterval: 0 });
  },
};

describe.each(Object.keys(adapters))("%s — set(key, null) removes the key", (name) => {
  describe.each([false, true])("encrypt: %s", (encrypt) => {
    let adapter;

    beforeEach(() => {
      adapter = adapters[name](encrypt);
    });

    it.each([null, undefined])("set(key, %s) leaves nothing to read", async (empty) => {
      await adapter.set("session", { validUntil: 123 });
      expect(await adapter.get("session")).toEqual({ validUntil: 123 });

      await adapter.set("session", empty);

      expect(await adapter.get("session")).toBeNull();
      expect(await adapter.has("session")).toBe(false);
    });

    it("drops the key's expiration with it", async () => {
      await adapter.set("session", { validUntil: 123 }, 60_000);
      expect(await adapter.getExpire("session")).not.toBeNull();

      await adapter.set("session", null);

      expect(await adapter.getExpire("session")).toBeNull();
    });

    it("leaves the other keys alone", async () => {
      await adapter.set("session", { validUntil: 123 });
      await adapter.set("theme", { mode: "dark" });

      await adapter.set("session", null);

      expect(await adapter.get("theme")).toEqual({ mode: "dark" });
    });
  });
});
