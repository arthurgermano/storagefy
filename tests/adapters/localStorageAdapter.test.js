import { describe, it, expect, beforeEach, vi } from "vitest";
import { sleep } from "misc-helpers";
import { Window } from "happy-dom";
import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import * as cryptoHelper from "../../src/helpers/cryptoHelper.js";

// ------------------------------------------------------------------------------------------------

let adapter;
function beforeEachTest() {
  const window = new Window();
  global.localStorage = window.localStorage;
  adapter = new LocalStorageAdapter({
    dbName: "testDB",
    encrypt: false, // test without encryption first
  });
}

beforeEach(beforeEachTest);

// ------------------------------------------------------------------------------------------------

describe("LocalStorageAdapter", () => {
  describe("_constructor", () => {
    it("should throw if localStorage is not available", () => {
      delete global.localStorage;
      expect(() => new LocalStorageAdapter({ dbName: "test" })).toThrow(
        "LocalStorage is not available in this environment"
      );
    });

    // --------------------------------------------------------------------------------------------

    it("should instantiate with custom encryption config", () => {
      const adapter = new LocalStorageAdapter({
        dbName: "secureDB",
        encrypt: true,
      });

      expect(adapter.encrypt).toBe(true);
    });

    // --------------------------------------------------------------------------------------------

    it("should start expire watcher", () => {
      vi.useFakeTimers();
      const spy = vi.spyOn(LocalStorageAdapter.prototype, "clearExpire");

      new LocalStorageAdapter({ dbName: "testDB" });
      vi.advanceTimersByTime(1000);

      expect(spy).toHaveBeenCalled();

      vi.useRealTimers();
      spy.mockRestore();
    });

    // --------------------------------------------------------------------------------------------

    it("should use default version and description if not provided", () => {
      const adapter = new LocalStorageAdapter({ dbName: "defaultsDB" });

      const meta = JSON.parse(global.localStorage.getItem(adapter.metaKey));
      expect(meta.version).toBe(1);
      expect(meta.description).toBe("");
    });

    // --------------------------------------------------------------------------------------------

    it("should respect custom version and description", () => {
      const adapter = new LocalStorageAdapter({
        dbName: "customMeta",
        version: 42,
        description: "My test database",
      });

      const meta = JSON.parse(global.localStorage.getItem(adapter.metaKey));
      expect(meta.version).toBe(42);
      expect(meta.description).toBe("My test database");
    });

    // --------------------------------------------------------------------------------------------

    it("should correctly store dbName and derived keys", () => {
      const adapter = new LocalStorageAdapter({ dbName: "derivedDB" });

      expect(adapter.dbName).toBe("derivedDB");
      expect(adapter.metaKey).toBe("STRGF_derivedDB__meta");
      expect(adapter.expireKey).toBe("STRGF_derivedDB__expires");
      expect(adapter.prefix).toBe("derivedDB__");
    });

    // --------------------------------------------------------------------------------------------

    it("should respect custom expireCheckInterval", () => {
      const adapter = new LocalStorageAdapter({
        dbName: "expireTest",
        expireCheckInterval: 5000,
      });

      expect(adapter.expireCheckInterval).toBe(5000);
    });

    // --------------------------------------------------------------------------------------------

    it("should create metadata only once even if instantiated twice with same dbName", async () => {
      const adapter1 = new LocalStorageAdapter({ dbName: "metaOnce" });
      const meta1 = global.localStorage[adapter1.metaKey];

      const adapter2 = new LocalStorageAdapter({ dbName: "metaOnce" });
      const meta2 = global.localStorage[adapter2.metaKey];

      await sleep(100); // wait for any async operations

      expect(meta1.dbName).toBe(meta2.dbName); // Same reference, not overwritten
      expect(meta1.version).toBe(meta2.version);
      expect(meta1.description).toBe(meta2.description);
    });

    // --------------------------------------------------------------------------------------------

    it("should call _initMeta and _startExpireWatcher", () => {
      const metaSpy = vi.spyOn(LocalStorageAdapter.prototype, "_initMeta");
      const watcherSpy = vi.spyOn(
        LocalStorageAdapter.prototype,
        "_startExpireWatcher"
      );

      new LocalStorageAdapter({ dbName: "callSpyDB" });

      expect(metaSpy).toHaveBeenCalled();
      expect(watcherSpy).toHaveBeenCalled();

      metaSpy.mockRestore();
      watcherSpy.mockRestore();
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("set/get", () => {
    it("should store and retrieve a value without encryption", async () => {
      await adapter.set("foo", "bar");
      const value = await adapter.get("foo");
      expect(value).toBe("bar");
    });

    // --------------------------------------------------------------------------------------------

    it("should return null for nonexistent key", async () => {
      const value = await adapter.get("nope");
      expect(value).toBeNull();
    });

    // --------------------------------------------------------------------------------------------

    it("should store and retrieve with encryption", async () => {
      adapter = new LocalStorageAdapter({
        dbName: "testEncryptedDB",
        encrypt: true,
      });

      await adapter.set("secure", "secretData");
      const value = await adapter.get("secure");
      expect(value).toBe("secretData");
    });

    // --------------------------------------------------------------------------------------------

    it("should return null for expired key", async () => {
      await adapter.set("temp", "value", -1000);
      const result = await adapter.get("temp");
      expect(result).toBeNull();
    });

    // --------------------------------------------------------------------------------------------

    it("should not expire key before its time", async () => {
      await adapter.set("valid", "stillHere", 5000);
      const result = await adapter.get("valid");
      expect(result).toBe("stillHere");
    });

    // --------------------------------------------------------------------------------------------

    it("should support storing and retrieving objects", async () => {
      const obj = { name: "Continuum", features: 5 };
      await adapter.set("meta", obj);
      const value = await adapter.get("meta");
      expect(value).toEqual(obj);
    });

    // --------------------------------------------------------------------------------------------

    it("should expire key after given time", async () => {
      const adapter = new LocalStorageAdapter({
        dbName: "testDB",
        encrypt: false,
        expireCheckInterval: 50, // mais rápido para o watcher rodar
      });

      await adapter.set("tempKey", "tempValue", 200);

      // Após 50ms, ainda deve existir
      await sleep(50);
      const stillExists = await adapter.get("tempKey");
      expect(stillExists).toBe("tempValue");

      // Após mais 200ms (total 250ms), deve estar expirado
      await sleep(200);
      const expired = await adapter.get("tempKey");
      expect(expired).toBeNull();
    });

    // --------------------------------------------------------------------------------------------

    it("should support numbers, booleans, arrays", async () => {
      await adapter.set("num", 42);
      expect(await adapter.get("num")).toBe(42);

      await adapter.set("bool", true);
      expect(await adapter.get("bool")).toBe(true);

      await adapter.set("arr", [1, 2, 3]);
      expect(await adapter.get("arr")).toEqual([1, 2, 3]);
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("list", () => {
    it("should list all keys with their values", async () => {
      await adapter.set("user1", { name: "Alice" });
      await adapter.set("user2", { name: "Bob" });

      const list = await adapter.list();
      const keys = list.map((entry) => entry.key);

      expect(keys).toContain("user1");
      expect(keys).toContain("user2");
      expect(list.length).toBe(2);
    });

    // --------------------------------------------------------------------------------------------

    it("should filter keys by prefix", async () => {
      await adapter.set("apple_fruit", "green");
      await adapter.set("apple_pie", "sweet");
      await adapter.set("banana", "yellow");

      const appleOnly = await adapter.list();
      const keys = appleOnly.map((entry) => entry.key);

      expect(keys).toContain("apple_fruit");
      expect(keys).toContain("apple_pie");
      expect(keys).toContain("banana");
      expect(appleOnly.length).toBe(3);
    });

    // --------------------------------------------------------------------------------------------

    it("should not return expired keys", async () => {
      await adapter.set("temp1", "keep");
      await adapter.set("temp2", "expire", 300);

      await sleep(500); // aguarda expiração
      const list = await adapter.list();

      const keys = list.map((entry) => entry.key);
      expect(keys).toContain("temp1");
      expect(keys).not.toContain("temp2");
    });

    // --------------------------------------------------------------------------------------------

    it("should return an empty list when no valid keys exist", async () => {
      await adapter.set("only", "value", 100);

      await sleep(200);
      const list = await adapter.list();
      expect(list).toEqual([]);
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("delete", () => {
    it("should remove an existing item from localStorage", async () => {
      await adapter.set("toDelete", { remove: true });

      expect(localStorage.getItem(adapter._fullKey("toDelete"))).not.toBeNull();

      await adapter.delete("toDelete");

      expect(localStorage.getItem(adapter._fullKey("toDelete"))).toBeNull();
    });

    // --------------------------------------------------------------------------------------------

    it("should remove expiration metadata when deleting a key", async () => {
      await adapter.set("withExpire", { data: 123 }, 10000); // expira em 10 segundos

      let exp = JSON.parse(localStorage.getItem(adapter.expireKey));
      expect(exp).toHaveProperty("withExpire");

      await adapter.delete("withExpire");

      exp = JSON.parse(localStorage.getItem(adapter.expireKey));
      expect(exp).not.toHaveProperty("withExpire");
    });

    // --------------------------------------------------------------------------------------------

    it("should not throw if the key does not exist", async () => {
      await expect(adapter.delete("nonExistentKey")).resolves.not.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should not alter expiration data of other keys", async () => {
      await adapter.set("key1", 1, 10000); // 10s
      await adapter.set("key2", 2, 10000); // 10s

      await adapter.delete("key1");

      const exp = JSON.parse(localStorage.getItem(adapter.expireKey));
      expect(exp).not.toHaveProperty("key1");
      expect(exp).toHaveProperty("key2");
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("has", () => {
    it("should return true if the key exists in localStorage", async () => {
      await adapter.set("exists", { check: true });
      const result = await adapter.has("exists");
      expect(result).toBe(true);
    });

    // --------------------------------------------------------------------------------------------

    it("should return false if the key does not exist", async () => {
      const result = await adapter.has("nonexistent");
      expect(result).toBe(false);
    });

    // --------------------------------------------------------------------------------------------

    it("should return false if the key existed but was deleted", async () => {
      await adapter.set("temp", 123);
      await adapter.delete("temp");

      const result = await adapter.has("temp");
      expect(result).toBe(false);
    });

    // --------------------------------------------------------------------------------------------

    it("should return false when the key is expired", async () => {
      await adapter.set("willExpire", "x", 50); // expires in 100ms
      await sleep(200); // wait for expiration
      const result = await adapter.has("willExpire");
      expect(result).toBe(false); // has() just checks presence, not validity
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("set with expire", () => {
    it("should set a key with an expiration time in milliseconds", async () => {
      await adapter.set("temp", "data", 500); // 0.5s
      const expiresAt = await adapter.getExpire("temp");
      expect(typeof expiresAt).toBe("number");
      expect(expiresAt).toBeGreaterThan(Date.now());
    });

    // --------------------------------------------------------------------------------------------

    it("should delete the key immediately if expire is 0", async () => {
      const result = await adapter.set("deleteNow", { bye: true }, 0);
      expect(result).toBe(null);
      const value = await adapter.get("deleteNow");
      expect(value).toBe(null);
    });

    // --------------------------------------------------------------------------------------------

    it("should not set expiration if expire is not a number", async () => {
      await adapter.set("noExpire", "forever", "not-a-number");
      const expiresAt = await adapter.getExpire("noExpire");
      expect(expiresAt).toBe(null);
    });

    // --------------------------------------------------------------------------------------------

    it("should not create expire record if expire is undefined", async () => {
      await adapter.set("normalKey", "justData");
      const expires = await adapter.getExpire("normalKey");
      expect(expires).toBe(null);
    });

    // --------------------------------------------------------------------------------------------

    it("should overwrite expiration if key is re-set with new expire", async () => {
      await adapter.set("rekey", "first", 1000);
      const firstExpire = await adapter.getExpire("rekey");
      await sleep(50);
      await adapter.set("rekey", "second", 2000);
      const secondExpire = await adapter.getExpire("rekey");

      expect(secondExpire).toBeGreaterThan(firstExpire);
    });

    // --------------------------------------------------------------------------------------------

    it("should not expire if set again with no expiration", async () => {
      await adapter.set("perma", "yes", 100);
      await adapter.set("perma", "still here"); // no expiration
      await sleep(150);
      const result = await adapter.get("perma");
      expect(result).toBe("still here");
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("getAll", () => {
    // -------------------------------------------------------------------------------------------

    beforeEach(async () => {
      beforeEachTest();
      await adapter.set("users__1", { name: "Alice" });
      await adapter.set("users__2", { name: "Bob" });
      await adapter.set("users__3", { name: "Carol" });

      await adapter.set("products__1", { name: "Keyboard" });
      await adapter.set("products__2", { name: "Mouse" });
    });

    // --------------------------------------------------------------------------------------------

    it("should return all items from a specific table", async () => {
      const users = await adapter.getAll();

      expect(users).toEqual([
        { key: "users__1", value: { name: "Alice" } },
        { key: "users__2", value: { name: "Bob" } },
        { key: "users__3", value: { name: "Carol" } },
        { key: "products__1", value: { name: "Keyboard" } },
        { key: "products__2", value: { name: "Mouse" } },
      ]);
    });

    // --------------------------------------------------------------------------------------------

    it("should return empty array if table has no entries", async () => {
      await adapter.clear();
      const results = await adapter.getAll();
      expect(results).toEqual([]);
    });

    // --------------------------------------------------------------------------------------------

    it("should not return expired items from a table", async () => {
      await adapter.set("users__4", { name: "Eve" }, 100); // expire after 100ms
      await sleep(150); // wait to expire

      const users = await adapter.getAll("users");
      const keys = users.map((item) => item.key);
      expect(keys).not.toContain("users__4");
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("expire management", () => {
    it("should return null if no expiration is set", async () => {
      await adapter.set("test", { hello: "world" });
      const expire = await adapter.getExpire("test");
      expect(expire).toBeNull();
    });

    // --------------------------------------------------------------------------------------------

    it("should return the correct expiration timestamp", async () => {
      const expireMs = 1000;
      const now = Date.now();
      await adapter.set("temp", { msg: "will expire" }, expireMs);

      const expire = await adapter.getExpire("temp");
      expect(typeof expire).toBe("number");
      expect(expire).toBeGreaterThanOrEqual(now + expireMs - 10);
      expect(expire).toBeLessThanOrEqual(now + expireMs + 10);
    });

    // --------------------------------------------------------------------------------------------

    it("should delete expiration of a key", async () => {
      await adapter.set("temp2", { msg: "temporary" }, 5000);
      await adapter.deleteExpire("temp2");

      const expire = await adapter.getExpire("temp2");
      expect(expire).toBeNull();
    });

    // --------------------------------------------------------------------------------------------

    it("should clear only expired keys", async () => {
      await adapter.set("expired1", { data: 1 }, 100);
      await adapter.set("expired2", { data: 2 }, 100);
      await adapter.set("valid1", { data: 3 }, 2000);

      await sleep(150);
      await adapter.clearExpire();

      expect(await adapter.has("expired1")).toBe(false);
      expect(await adapter.has("expired2")).toBe(false);
      expect(await adapter.has("valid1")).toBe(true);
    });

    // --------------------------------------------------------------------------------------------

    it("should do nothing if no keys are expired", async () => {
      await adapter.set("valid2", { data: 123 }, 3000);
      const before = await adapter.getExpire("valid2");

      await adapter.clearExpire();

      const after = await adapter.getExpire("valid2");
      expect(after).toBe(before);
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("clear", () => {
    let adapter;

    beforeEach(() => {
      adapter = new LocalStorageAdapter({ dbName: "testDB" });
    });

    it("should clear all data, meta and expire keys", async () => {
      await adapter.set("key1", "value1");
      await adapter.set("key2", "value2", 1000); // chave com expiração
      await adapter.setExpire("key1", Date.now() + 5000); // expiração manual

      // Confirma que os dados foram definidos corretamente
      expect(await adapter.get("key1")).toBe("value1");
      expect(await adapter.get("key2")).toBe("value2");
      expect(await adapter.getExpire("key1")).toBeTypeOf("number");

      // Executa o clear
      await adapter.clear();

      // Verifica se os dados foram realmente apagados
      expect(await adapter.get("key1")).toBeNull();
      expect(await adapter.get("key2")).toBeNull();
      expect(await adapter.getExpire("key1")).toBeNull();
      expect(localStorage.getItem(adapter.metaKey)).toBeNull();
      expect(localStorage.getItem(adapter.expireKey)).toBeNull();
    });

    it("should not remove unrelated keys", async () => {
      localStorage.setItem("unrelated_key", "preserve this");

      await adapter.set("somekey", "value");
      await adapter.clear();

      expect(localStorage.getItem("unrelated_key")).toBe("preserve this");
    });
  });

  // ----------------------------------------------------------------------------------------------

  describe("reset", () => {
    it("should remove all keys with the specified prefix (num, bool, arr)", async () => {
      await adapter.set("num", 42);
      await adapter.set("bool", true);
      await adapter.set("arr", [1, 2, 3]);
      await adapter.set("otherPrefix_key", "should not be removed");

      await adapter.reset();

      expect(await adapter.get("testDb__num")).toBeNull();
      expect(await adapter.get("testDb__bool")).toBeNull();
      expect(await adapter.get("testDb__arr")).toBeNull();
      expect(await adapter.get("otherPrefix_key")).toBeNull();
    });

    // ----------------------------------------------------------------------------------------------

    it("should not throw error if localStorage is empty", async () => {
      await adapter.reset();
      const list = await adapter.list();
      expect(list).toEqual([]);
    });

    // ----------------------------------------------------------------------------------------------
  });
});

// ------------------------------------------------------------------------------------------------
