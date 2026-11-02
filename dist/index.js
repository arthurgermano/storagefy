import IndexedDBAdapter from "./adapters/IndexedDBAdapter.js";
import LocalStorageAdapter from "./adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "./adapters/SessionStorageAdapter.js";
import PiniaAdapter from "./stores/PiniaAdapter.js";
import ReactAdapter from "./stores/ReactAdapter.js";
import SvelteAdapter from "./stores/SvelteAdapter.js";
import { logError } from "./helpers/loggerHelper.js";
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
const FRAMEWORKS = { pinia: PiniaAdapter, react: ReactAdapter, svelte: SvelteAdapter };
const keptAdapters = { pinia: null, react: null, svelte: null };
function startStoragefy(config = {}) {
  const params = { ...DEFAULT_CONFIG, ...config };
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
function _retireStorageAdapter(replaced) {
  for (const name of Object.keys(keptAdapters)) {
    if (keptAdapters[name]?.adapter === replaced) {
      keptAdapters[name].destroyAll();
      keptAdapters[name] = null;
    }
  }
  void replaced.destroy();
}
function getStorageAdapter() {
  if (!storageAdapter) {
    throw new Error("Storage adapter not initialized. Call startStoragefy first.");
  }
  return storageAdapter;
}
function _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, cachedAdapter, AdapterClass) {
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
function _adapterFor(name, { adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  const found = { adapter, adapterParams, forceRecreate };
  if (fresh) {
    return _getFrameworkAdapter(found, null, FRAMEWORKS[name]);
  }
  keptAdapters[name] = _getFrameworkAdapter(found, keptAdapters[name], FRAMEWORKS[name]);
  return keptAdapters[name];
}
function _keptAdapterFor(name) {
  keptAdapters[name] ??= _getFrameworkAdapter({}, null, FRAMEWORKS[name]);
  return keptAdapters[name];
}
function getPiniaAdapter(options = {}) {
  const piniaAdapter = (
    /** @type {PiniaAdapter} */
    _adapterFor("pinia", options)
  );
  if (options.fresh) {
    return piniaAdapter;
  }
  return {
    setInStorage: piniaAdapter.setInStorage.bind(piniaAdapter),
    getFromStorage: piniaAdapter.getFromStorage.bind(piniaAdapter)
  };
}
function getReactAdapter(options = {}) {
  return (
    /** @type {ReactAdapter} */
    _adapterFor("react", options)
  );
}
function getSvelteAdapter(options = {}) {
  return (
    /** @type {SvelteAdapter} */
    _adapterFor("svelte", options)
  );
}
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
async function setPiniaStorage(store, key, options = {}) {
  await _loadAndKeep(_keptAdapterFor("pinia"), store, key, options);
}
async function setReactStorage(store, key, options = {}) {
  await _loadAndKeep(_keptAdapterFor("react"), store, key, options);
}
async function setSvelteStorage(store, key, options = {}) {
  await _loadAndKeep(_keptAdapterFor("svelte"), store, key, options);
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