import { describe, it, expect, beforeEach } from "vitest";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as cryptoHelper from "../../src/helpers/cryptoHelper.js";
import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";

// ------------------------------------------------------------------------------------------------
// The `password` option: the encryption key is derived from the app's secret, with the storage key as salt. Without
// it, the key comes from the storage key alone (as before) — readable by anyone who knows this library.
// ------------------------------------------------------------------------------------------------

const adapters = {
  LocalStorageAdapter: {
    reset: () => (global.localStorage = new Window().localStorage),
    create: (options) => new LocalStorageAdapter({ dbName: "pwDB", expireCheckInterval: 0, ...options }),
    raw: () => global.localStorage,
  },
  SessionStorageAdapter: {
    reset: () => (global.sessionStorage = new Window().sessionStorage),
    create: (options) => new SessionStorageAdapter({ dbName: "pwDB", expireCheckInterval: 0, ...options }),
    raw: () => global.sessionStorage,
  },
  IndexedDBAdapter: {
    reset: () => (global.indexedDB = new IDBFactory()),
    create: (options) => new IndexedDBAdapter({ dbName: "pwDB", expireCheckInterval: 0, ...options }),
    raw: null,
  },
};

describe.each(Object.keys(adapters))("%s — password", (name) => {
  const setup = adapters[name];

  beforeEach(() => {
    setup.reset();
  });

  it("reads back with the same password — in another adapter too (a reload, another tab)", async () => {
    await setup.create({ encrypt: true, password: "app-secret" }).set("session", { validUntil: 1 });
    expect(await setup.create({ encrypt: true, password: "app-secret" }).get("session")).toEqual({ validUntil: 1 });
  });

  it("cannot read with another password", async () => {
    await setup.create({ encrypt: true, password: "app-secret" }).set("session", { validUntil: 1 });
    expect(await setup.create({ encrypt: true, password: "other-secret" }).get("session")).toBeNull();
  });

  it("cannot be read without the password — knowing the library is no longer enough", async () => {
    await setup.create({ encrypt: true, password: "app-secret" }).set("session", { validUntil: 1 });
    expect(await setup.create({ encrypt: true }).get("session")).toBeNull();
  });

  it("without a password, works as before — values stay readable across versions", async () => {
    await setup.create({ encrypt: true }).set("session", { validUntil: 2 });
    expect(await setup.create({ encrypt: true }).get("session")).toEqual({ validUntil: 2 });
  });

  if (setup.raw !== null) {
    it("stores what the storage-key-only derivation cannot open", async () => {
      const adapter = setup.create({ encrypt: true, password: "app-secret" });
      await adapter.set("session", { validUntil: 3 });
      const stored = JSON.parse(setup.raw().getItem(adapter._fullKey("session")));

      const keyOnly = await cryptoHelper.deriveKey("session");
      await expect(cryptoHelper.decryptData(keyOnly, stored, false)).rejects.toThrow();
    });
  }

  it.each([
    ["an empty password", ""],
    ["a number", 123],
    ["an object", { secret: "x" }],
  ])("refuses %s", (_case, password) => {
    expect(() => setup.create({ encrypt: true, password })).toThrow("Storagefy: password must be a non-empty string");
  });

  it("ignores the password when encrypt is off — the value is stored as is", async () => {
    const adapter = setup.create({ encrypt: false, password: "app-secret" });
    await adapter.set("session", { validUntil: 4 });
    expect(await setup.create({ encrypt: false }).get("session")).toEqual({ validUntil: 4 });
  });
});
