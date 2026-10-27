import IndexedDBAdapter from "./adapters/IndexedDBAdapter.js";
import LocalStorageAdapter from "./adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "./adapters/SessionStorageAdapter.js";
import PiniaAdapter from "./stores/PiniaAdapter.js";
import ReactAdapter from "./stores/ReactAdapter.js";
import SvelteAdapter from "./stores/SvelteAdapter.js";
const DEFAULT_CONFIG = {
  dbName: "storagefy",
  storeName: "storagefy_db",
  version: 1,
  encrypt: false,
  expireCheckInterval: 1e3,
  description: "Storagefy database",
  adapter: "indexedDB"
};
let storageAdapter;
let piniaAdapter;
let reactAdapter;
let svelteAdapter;
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
function getStorageAdapter() {
  if (!storageAdapter) {
    throw new Error("Storage adapter not initialized. Call startStoragefy first.");
  }
  return storageAdapter;
}
function _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, cachedAdapter, AdapterClass) {
  if (adapter) {
    return new AdapterClass(adapter);
  }
  if (cachedAdapter && !forceRecreate) {
    return cachedAdapter;
  }
  if (adapterParams) {
    const storageAdapter2 = _createStorageAdapter(adapterParams);
    return new AdapterClass(storageAdapter2);
  }
  if (!storageAdapter) {
    throw new Error("Storage adapter not initialized. Call startStoragefy first.");
  }
  return new AdapterClass(storageAdapter);
}
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
export {
  IndexedDBAdapter,
  LocalStorageAdapter,
  PiniaAdapter,
  ReactAdapter,
  SessionStorageAdapter,
  SvelteAdapter,
  getPiniaAdapter,
  getReactAdapter,
  getStorageAdapter,
  getSvelteAdapter,
  setPiniaStorage,
  setReactStorage,
  setSvelteStorage,
  startStoragefy
};
//# sourceMappingURL=index.js.map