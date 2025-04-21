import IndexedDBAdapter from "./adapters/IndexedDBAdapter.js";
import LocalStorageAdapter from "./adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "./adapters/SessionStorageAdapter.js";
import PiniaAdapter from "./stores/PiniaAdapter.js";
import ReactAdapter from "./stores/ReactAdapter.js";
import SvelteAdapter from "./stores/SvelteAdapter.js";

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
 * @param {boolean} [config.encrypt=false] Enable encryption
 * @param {string|boolean} [config.channelName=false] Channel name for storage communication between tabs
 * @param {number} [config.expireCheckInterval=1000] Expiration check interval
 * @param {string} [config.description="Storagefy database"] Database description
 * @param {boolean} [config.forceRecreate=false] Force recreation of adapter
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

  if (!config.forceRecreate && storageAdapter) {
    return storageAdapter;
  }

  switch (params.adapter) {
    case "localStorage":
      if (config.fresh) {
        return new LocalStorageAdapter(params);
      }
      storageAdapter = new LocalStorageAdapter(params);
      break;
    case "sessionStorage":
      if (config.fresh) {
        return new SessionStorageAdapter(params);
      }
      storageAdapter = new SessionStorageAdapter(params);
      break;
    default:
      if (config.fresh) {
        return new IndexedDBAdapter(params);
      }
      storageAdapter = new IndexedDBAdapter(params);
  }

  return storageAdapter;
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
 * Creates or retrieves a framework-specific adapter with consistent interface.
 * @private
 * @param {Object} options Options for adapter creation
 * @param {Object} [options.adapter] Pre-configured storage adapter
 * @param {Object} [options.adapterParams] Parameters to create new storage adapter
 * @param {boolean} [options.forceRecreate=false] Force recreation of adapter
 * @param {Object} cachedAdapter Reference to cached adapter
 * @param {Function} AdapterClass Class to instantiate
 * @returns {Object} Framework adapter instance
 */
function _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, cachedAdapter, AdapterClass) {
  if (adapter) {
    return new AdapterClass(adapter);
  }

  if (cachedAdapter && !forceRecreate) {
    return cachedAdapter;
  }

  if (adapterParams) {
    const storageAdapter = _createStorageAdapter(adapterParams);
    return new AdapterClass(storageAdapter);
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
 * @param {Object} params Adapter parameters
 * @returns {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter} Storage adapter
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
 * Gets a Pinia store adapter instance.
 * @param {Object} options Configuration options
 * @param {Object} [options.adapter] Pre-configured storage adapter
 * @param {Object} [options.adapterParams] Parameters to create new storage adapter
 * @param {boolean} [options.forceRecreate=false] Force recreation of adapter
 * @param {boolean} [options.fresh=false] Force creation of new adapter and return a new instance - does not re-use existing adapter or update it
 * @returns {{setInStorage: Function, getFromStorage: Function}} Pinia adapter methods
 * @throws {Error} If adapter cannot be created
 */
function getPiniaAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, PiniaAdapter);
  }
  piniaAdapter = _getFrameworkAdapter(
    { adapter, adapterParams, forceRecreate },
    piniaAdapter,
    PiniaAdapter
  );
  return {
    setInStorage: piniaAdapter.setInStorage.bind(piniaAdapter),
    getFromStorage: piniaAdapter.getFromStorage.bind(piniaAdapter)
  };
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets a React store adapter instance.
 * @param {Object} options Configuration options
 * @param {Object} [options.adapter] Pre-configured storage adapter
 * @param {Object} [options.adapterParams] Parameters to create new storage adapter
 * @param {boolean} [options.forceRecreate=false] Force recreation of adapter
 * @param {boolean} [options.fresh=false] Force creation of new adapter and return a new instance - does not re-use existing adapter or update it
 * @returns {ReactAdapter} React adapter instance
 * @throws {Error} If adapter cannot be created
 */
function getReactAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, ReactAdapter);
  }
  reactAdapter = _getFrameworkAdapter(
    { adapter, adapterParams, forceRecreate },
    reactAdapter,
    ReactAdapter
  );
  return reactAdapter;
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets a Svelte store adapter instance.
 * @param {Object} options Configuration options
 * @param {Object} [options.adapter] Pre-configured storage adapter
 * @param {Object} [options.adapterParams] Parameters to create new storage adapter
 * @param {boolean} [options.forceRecreate=false] Force recreation of adapter
 * @param {boolean} [options.fresh=false] Force creation of new adapter and return a new instance - does not re-use existing adapter or update it
 * @returns {SvelteAdapter} Svelte adapter instance
 * @throws {Error} If adapter cannot be created
 */
function getSvelteAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, SvelteAdapter);
  }
  svelteAdapter = _getFrameworkAdapter(
    { adapter, adapterParams, forceRecreate },
    svelteAdapter,
    SvelteAdapter
  );
  return svelteAdapter;
}

// ------------------------------------------------------------------------------------------------

async function setPiniaStorage(store, key, options = {}) {
  try {
    if (!piniaAdapter) {
      getPiniaAdapter();
    }
    if (!store) {
      throw new Error("Store is required.");
    }
    if (!key) {
      throw new Error("Key is required.");
    }
    await piniaAdapter.getFromStorage(store, key);
    await piniaAdapter.setInStorage(store, key, options);
  } catch (error) {
    logError(error);
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------

async function setReactStorage(store, key, options = {}) {
  try {
    if (!reactAdapter) {
      getReactAdapter();
    }
    if (!store) {
      throw new Error("Store is required.");
    }
    if (!key) {
      throw new Error("Key is required.");
    }
    await reactAdapter.getFromStorage(store, key);
    await reactAdapter.setInStorage(store, key, options);
  } catch (error) {
    logError(error);
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------

async function setSvelteStorage(store, key, options = {}) {
  try {
    if (!svelteAdapter) {
      getSvelteAdapter();
    }
    if (!store) {
      throw new Error("Store is required.");
    }
    if (!key) {
      throw new Error("Key is required.");
    }
    await svelteAdapter.getFromStorage(store, key);
    await svelteAdapter.setInStorage(store, key, options);
  } catch (error) {
    logError(error);
    throw error;
  }
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
