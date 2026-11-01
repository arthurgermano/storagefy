import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";
import * as cryptoHelper from "../../src/helpers/cryptoHelper.js";

// ------------------------------------------------------------------------------------------------
// The three storage adapters, each over a storage of its own — the tests of a behavior run against all of them
// (describe.each(STORAGE_NAMES)). Two adapters opened after one fresh() share the storage, as two tabs of one app do.
// ------------------------------------------------------------------------------------------------

const KINDS = {
  LocalStorageAdapter: {
    fresh: () => {
      globalThis.localStorage = new Window().localStorage;
    },
    create: (options) => new LocalStorageAdapter(options),
  },
  SessionStorageAdapter: {
    fresh: () => {
      globalThis.sessionStorage = new Window().sessionStorage;
    },
    create: (options) => new SessionStorageAdapter(options),
  },
  IndexedDBAdapter: {
    fresh: () => {
      globalThis.indexedDB = new IDBFactory();
    },
    create: (options) => new IndexedDBAdapter(options),
  },
};

export const STORAGE_NAMES = Object.keys(KINDS);

const opened = [];

/** A new, empty storage of this kind — the adapters opened after it share it */
export function freshStorage(name) {
  KINDS[name].fresh();
}

/**
 * Opens an adapter (on the current storage of its kind); closeAll() closes it.
 * @param {string} name - One of STORAGE_NAMES.
 * @param {object} [options] - Adapter options; dbName "testDB" and no expiry watcher unless given.
 */
export function openStorage(name, options = {}) {
  const adapter = KINDS[name].create({ dbName: "testDB", expireCheckInterval: 0, ...options });
  opened.push(adapter);
  return adapter;
}

/** Destroys every adapter opened (watcher, channel, IndexedDB connection) */
export function closeAll() {
  return Promise.all(opened.splice(0).map((adapter) => adapter.destroy()));
}

/** A channel name no other test uses */
export function uniqueChannel() {
  return `test_${Math.random().toString(36).slice(2)}`;
}

/** Lets a write, the broadcast and the other tab's update run */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 60));

/**
 * Writes a raw stored text under a key, bypassing the adapter — what another version of the library left there.
 * @param {object} adapter
 * @param {string} key
 * @param {string} stored
 */
export async function writeRaw(adapter, key, stored) {
  if (adapter instanceof IndexedDBAdapter) {
    await adapter._withStore("readwrite", (store) => adapter._answerOf(store.put(stored, adapter._fullKey(key))));
    return;
  }
  adapter._storage.setItem(adapter._fullKey(key), stored);
}

/**
 * The raw stored text of a key.
 * @param {object} adapter
 * @param {string} key
 * @returns {Promise<string|undefined|null>}
 */
export async function readRaw(adapter, key) {
  if (adapter instanceof IndexedDBAdapter) {
    return adapter._withStore("readonly", (store) => adapter._answerOf(store.get(adapter._fullKey(key))));
  }
  return adapter._storage.getItem(adapter._fullKey(key));
}

/**
 * A value as 1.2.x stored it: PBKDF2 (with the password, or the key's own name), the JSON text encrypted as a JSON
 * string, and the bytes turned into text before base64.
 * @param {string} key
 * @param {unknown} value
 * @param {string} [password]
 */
export async function encryptedLike120(key, value, password) {
  const cKey = password ? await cryptoHelper.deriveKey(password, key) : await cryptoHelper.deriveKey(key);
  return JSON.stringify(await cryptoHelper.encryptData(cKey, JSON.stringify(value), false));
}
