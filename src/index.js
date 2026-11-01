import IndexedDBAdapter from "./adapters/IndexedDBAdapter.js";
import LocalStorageAdapter from "./adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "./adapters/SessionStorageAdapter.js";
import PiniaAdapter from "./stores/PiniaAdapter.js";
import ReactAdapter from "./stores/ReactAdapter.js";
import SvelteAdapter from "./stores/SvelteAdapter.js";
import { logError } from "./helpers/loggerHelper.js";

// ------------------------------------------------------------------------------------------------
// Types an app names (import type { SetInStorageOptions } from "storagefy") — the package exports only this entry
// ------------------------------------------------------------------------------------------------

/** @typedef {import("./adapters/StorageAdapter.js").StorageAdapterOptions} StorageAdapterOptions */
/** @typedef {import("./adapters/StorageAdapter.js").ReadOptions} ReadOptions */
/** @typedef {import("./adapters/StorageAdapter.js").DataChange} DataChange */
/** @typedef {import("./stores/StoreAdapter.js").SetInStorageOptions} SetInStorageOptions */
/** @typedef {import("./stores/StoreAdapter.js").GetFromStorageOptions} GetFromStorageOptions */

// ------------------------------------------------------------------------------------------------
// Constants and Configuration
// ------------------------------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  dbName: "storagefy",
  storeName: "storagefy_db",
  version: 1,
  encrypt: false,
  expireCheckInterval: 1000,
  description: "Storagefy database",
  adapter: "indexedDB"
};

// ------------------------------------------------------------------------------------------------
// Storage Management
// ------------------------------------------------------------------------------------------------

let storageAdapter;
let piniaAdapter;
let reactAdapter;
let svelteAdapter;

/**
 * Initializes and returns a storage adapter instance.
 * @param {Object} config Configuration options
 * @param {string} [config.dbName="storagefy"] Database name
 * @param {string} [config.storeName="storagefy_db"] Store name
 * @param {number} [config.version=1] Database version
 * @param {boolean} [config.encrypt=false] Enable encryption — it makes the values hard to read in the browser; it does
 *   not keep a secret: never store a token or a password with Storagefy
 * @param {string} [config.password] Secret of the app the encryption keys are derived from — without it, a key is
 *   derived from the storage key's own name
 * @param {"hkdf"|"pbkdf2"} [config.keyDerivation="hkdf"] How the keys are derived from the password: "hkdf" (fast)
 *   when the password is a constant of the app; "pbkdf2" (slow on purpose) only when the person types it
 * @param {string|false} [config.channelName=false] Channel name for storage communication between tabs
 * @param {boolean} [config.enableSyncTabs=false] Tell the other tabs about every write (needs channelName; each store
 *   also asks for it with syncTabs)
 * @param {number} [config.expireCheckInterval=1000] Expiration check interval (ms); 0 turns it off
 * @param {string} [config.description="Storagefy database"] Database description
 * @param {boolean} [config.forceRecreate=false] Replace the adapter kept with a new one: the old one is destroyed, and
 *   the store adapters kept over it stop keeping their stores (keep them again)
 * @param {boolean} [config.fresh=false] Force creation of new adapter and return a new instance - does not re-use existing adapter or update it
 * @param {"indexedDB"|"localStorage"|"sessionStorage"} [config.adapter="indexedDB"] Storage adapter type
 * @returns {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter} Storage adapter instance
 * @throws {Error} If adapter initialization fails
 * @example
 * // Basic usage
 * const adapter = startStoragefy({ dbName: 'my-app' });
 * 
 * // With encryption
 * const secureAdapter = startStoragefy({
 *   dbName: 'secure-app',
 *   encrypt: true,
 *   password: 'my-secret-password'
 * });
 */
function startStoragefy(config = {}) {
  const params = { ...DEFAULT_CONFIG, ...config };
  // fresh first: up to 1.2.x an adapter already started was returned instead of the new one asked for
  if (config.fresh) {
    return _createStorageAdapter(params);
  }
  if (storageAdapter && !config.forceRecreate) {
    return storageAdapter;
  }
  if (storageAdapter) {
    _retireStorageAdapter(storageAdapter);
  }
  storageAdapter = _createStorageAdapter(params);
  return storageAdapter;
}

// ------------------------------------------------------------------------------------------------

/**
 * Ends the storage adapter forceRecreate replaces: the store adapters kept over it stop keeping their stores and are
 * forgotten (the helpers create new ones over the new adapter — keep the stores again), then it is destroyed. Nothing
 * keeps writing to an adapter that is gone.
 * @private
 * @param {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter} replaced
 */
function _retireStorageAdapter(replaced) {
  const over = (kept) => {
    if (kept?.adapter !== replaced) {
      return kept;
    }
    kept.destroyAll();
    return undefined;
  };
  piniaAdapter = over(piniaAdapter);
  reactAdapter = over(reactAdapter);
  svelteAdapter = over(svelteAdapter);
  void replaced.destroy();
}

// ------------------------------------------------------------------------------------------------

/**
 * Retrieves the current storage adapter instance.
 * @returns {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter} Storage adapter instance
 * @throws {Error} If adapter is not initialized
 */
function getStorageAdapter() {
  if (!storageAdapter) {
    throw new Error("Storage adapter not initialized. Call startStoragefy first.");
  }
  return storageAdapter;
}

// ------------------------------------------------------------------------------------------------
// Framework Adapter Factories
// ------------------------------------------------------------------------------------------------

/**
 * Where a store adapter takes its storage adapter from.
 * @typedef {Object} FrameworkAdapterOptions
 * @property {import("./adapters/StorageAdapter.js").default} [adapter] - A storage adapter you created.
 * @property {Parameters<typeof startStoragefy>[0]} [adapterParams] - Or the options of a new one.
 * @property {boolean} [forceRecreate=false] - Create a new store adapter instead of the one kept — whose stores stop
 *   being kept (keep them again with the new one).
 * @property {boolean} [fresh=false] - Return a new store adapter and keep the one kept as it is.
 */

/**
 * Creates or retrieves a store adapter: over the storage adapter given, over a new one, or over the one
 * startStoragefy created.
 * @private
 * @template T
 * @param {FrameworkAdapterOptions} options
 * @param {T | null | undefined} cachedAdapter - The store adapter kept.
 * @param {new (adapter: import("./adapters/StorageAdapter.js").default) => T} AdapterClass
 * @returns {T}
 * @throws {Error} If no storage adapter was given or started.
 */
function _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, cachedAdapter, AdapterClass) {
  // Replaced: its stores stop being kept, or they would be written twice — by it and by the new one
  if (forceRecreate) {
    cachedAdapter?.destroyAll();
  }
  if (adapter) {
    return new AdapterClass(adapter);
  }
  if (cachedAdapter && !forceRecreate) {
    return cachedAdapter;
  }
  if (adapterParams) {
    return new AdapterClass(_createStorageAdapter(adapterParams));
  }
  if (!storageAdapter) {
    throw new Error("Storage adapter not initialized. Call startStoragefy first.");
  }
  return new AdapterClass(storageAdapter);
}

// ------------------------------------------------------------------------------------------------

/**
 * Creates a storage adapter based on parameters.
 * @private
 * @param {Parameters<typeof startStoragefy>[0]} params
 * @returns {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter}
 */
function _createStorageAdapter(params) {
  switch (params.adapter) {
    case "localStorage":
      return new LocalStorageAdapter(params);
    case "sessionStorage":
      return new SessionStorageAdapter(params);
    default:
      return new IndexedDBAdapter(params);
  }
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets a Pinia store adapter's methods.
 * @param {FrameworkAdapterOptions} [options]
 * @returns {{ setInStorage: PiniaAdapter["setInStorage"], getFromStorage: PiniaAdapter["getFromStorage"] }} The
 *   methods of the adapter kept — or, with `fresh`, a new adapter (it has the same methods).
 * @throws {Error} If no storage adapter was given or started.
 */
function getPiniaAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, PiniaAdapter);
  }
  piniaAdapter = _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, piniaAdapter, PiniaAdapter);
  return {
    setInStorage: piniaAdapter.setInStorage.bind(piniaAdapter),
    getFromStorage: piniaAdapter.getFromStorage.bind(piniaAdapter),
  };
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets a React store adapter.
 * @param {FrameworkAdapterOptions} [options]
 * @returns {ReactAdapter} The adapter kept — or, with `fresh`, a new one.
 * @throws {Error} If no storage adapter was given or started.
 */
function getReactAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, ReactAdapter);
  }
  reactAdapter = _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, reactAdapter, ReactAdapter);
  return reactAdapter;
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets a Svelte store adapter.
 * @param {FrameworkAdapterOptions} [options]
 * @returns {SvelteAdapter} The adapter kept — or, with `fresh`, a new one.
 * @throws {Error} If no storage adapter was given or started.
 */
function getSvelteAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, SvelteAdapter);
  }
  svelteAdapter = _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, svelteAdapter, SvelteAdapter);
  return svelteAdapter;
}

// ------------------------------------------------------------------------------------------------

/**
 * Loads a store from storage and keeps it there, with a store adapter.
 * @private
 * @param {{ getFromStorage: Function, setInStorage: Function }} storeAdapter
 * @param {any} store
 * @param {string} key
 * @param {import("./stores/StoreAdapter.js").SetInStorageOptions} options
 * @returns {Promise<void>}
 * @throws {Error} If the store or the key is missing, or the store adapter refuses the store.
 */
async function _loadAndKeep(storeAdapter, store, key, options) {
  try {
    if (!store) {
      throw new Error("Store is required.");
    }
    if (!key) {
      throw new Error("Key is required.");
    }
    await storeAdapter.getFromStorage(store, key, { onError: options.onError });
    await storeAdapter.setInStorage(store, key, options);
  } catch (error) {
    logError(error);
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------

/**
 * Loads a Pinia store from storage, then keeps every change there — with the Pinia adapter kept (created over the
 * storage startStoragefy created, the first time).
 * @param {any} store - The Pinia store.
 * @param {string} key - Storage key.
 * @param {import("./stores/StoreAdapter.js").SetInStorageOptions} [options]
 * @returns {Promise<void>}
 * @throws {Error} If the store or the key is missing, or no storage adapter was started.
 */
async function setPiniaStorage(store, key, options = {}) {
  piniaAdapter ??= _getFrameworkAdapter({}, null, PiniaAdapter);
  await _loadAndKeep(piniaAdapter, store, key, options);
}

// ------------------------------------------------------------------------------------------------

/**
 * Loads a React store (Redux, Zustand…) from storage, then keeps every change there — with the React adapter kept.
 * @param {any} store - The store.
 * @param {string} key - Storage key.
 * @param {import("./stores/StoreAdapter.js").SetInStorageOptions} [options]
 * @returns {Promise<void>}
 * @throws {Error} If the store or the key is missing, or no storage adapter was started.
 */
async function setReactStorage(store, key, options = {}) {
  reactAdapter ??= _getFrameworkAdapter({}, null, ReactAdapter);
  await _loadAndKeep(reactAdapter, store, key, options);
}

// ------------------------------------------------------------------------------------------------

/**
 * Loads a Svelte writable store from storage, then keeps every change there — with the Svelte adapter kept.
 * @param {any} store - The writable store.
 * @param {string} key - Storage key.
 * @param {import("./stores/StoreAdapter.js").SetInStorageOptions} [options]
 * @returns {Promise<void>}
 * @throws {Error} If the store or the key is missing, or no storage adapter was started.
 */
async function setSvelteStorage(store, key, options = {}) {
  svelteAdapter ??= _getFrameworkAdapter({}, null, SvelteAdapter);
  await _loadAndKeep(svelteAdapter, store, key, options);
}

// ------------------------------------------------------------------------------------------------
// Exports
// ------------------------------------------------------------------------------------------------

export {
  // Storage adapters
  IndexedDBAdapter,
  LocalStorageAdapter,
  SessionStorageAdapter,
  // Framework adapters
  PiniaAdapter,
  ReactAdapter,
  SvelteAdapter,
  // Utility functions
  startStoragefy,
  getStorageAdapter,
  getPiniaAdapter,
  getReactAdapter,
  getSvelteAdapter,
  setPiniaStorage,
  setReactStorage,
  setSvelteStorage,
};
