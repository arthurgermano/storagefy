// What the browser tests reach in a page (window.lab): the package as published, the store libraries, and a few steps
// an app takes — open a storage, keep a store, change it, read it. Each test drives them with page.evaluate; one page
// is one tab of the app.
import * as storagefy from "/dist/index.js";
import { createPinia, defineStore } from "pinia";
import { writable, get } from "svelte/store";
import { createStore } from "zustand/vanilla";

const STORAGES = {
  localStorage: storagefy.LocalStorageAdapter,
  sessionStorage: storagefy.SessionStorageAdapter,
  indexedDB: storagefy.IndexedDBAdapter,
};

const STORE_ADAPTERS = {
  pinia: storagefy.PiniaAdapter,
  svelte: storagefy.SvelteAdapter,
  zustand: storagefy.ReactAdapter,
};

/** The stores kept in this tab, by key */
const kept = {};

/**
 * A storage adapter, as an app opens it: namespace "app", no expiry watcher unless asked.
 * @param {"localStorage"|"sessionStorage"|"indexedDB"} storage
 * @param {object} [options]
 */
function openStorage(storage, options = {}) {
  return new STORAGES[storage]({ dbName: "app", expireCheckInterval: 0, ...options });
}

/** A store of a library, holding a state */
function createLibraryStore(library, key, initial) {
  if (library === "pinia") {
    return defineStore(key, { state: () => copyOf(initial) })(createPinia());
  }
  if (library === "svelte") {
    return writable(initial);
  }
  return createStore(() => initial);
}

/** A copy of a JSON value (the state of a Pinia store is created anew by its factory) */
function copyOf(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Keeps a store in storage, as an app does on start: loads what is stored (load), then keeps every change. Counts the
 * writes of its storage adapter and the errors told through onError.
 * @param {string} key
 * @param {{ library: "pinia"|"svelte"|"zustand", storage: string, initial: any, storageOptions?: object,
 *   syncTabs?: boolean, load?: boolean }} how
 */
async function keep(key, { library, storage, initial, storageOptions = {}, syncTabs = true, load = false }) {
  const storageAdapter = openStorage(storage, { channelName: "app-tabs", enableSyncTabs: true, ...storageOptions });
  const entry = { library, storageAdapter, writes: 0, errors: [] };
  const set = storageAdapter.set.bind(storageAdapter);
  storageAdapter.set = (...args) => {
    entry.writes += 1;
    return set(...args);
  };
  const onError = (error) => entry.errors.push(String(error.cause?.message ?? error.message));
  entry.store = createLibraryStore(library, key, initial);
  entry.storeAdapter = new STORE_ADAPTERS[library](storageAdapter);
  if (load) {
    entry.loaded = (await entry.storeAdapter.getFromStorage(entry.store, key, { onError })) === true;
  }
  await entry.storeAdapter.setInStorage(entry.store, key, { syncTabs, onError });
  entry.writes = 0;
  kept[key] = entry;
}

/** Changes a kept store, the way its library does */
function change(key, state) {
  const { library, store } = kept[key];
  if (library === "pinia") store.$patch(state);
  else if (library === "svelte") store.set(state);
  else store.setState(state, true);
}

/** The state of a kept store now */
function read(key) {
  const { library, store } = kept[key];
  const state = library === "pinia" ? store.$state : library === "svelte" ? get(store) : store.getState();
  return state === undefined ? undefined : copyOf(state);
}

window.lab = { storagefy, openStorage, keep, change, read, kept, STORAGES };
window.labReady = true;
