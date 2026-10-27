import StoreAdapter from "./StoreAdapter.js";
import { assign } from "misc-helpers";
import { logError, logInfo } from "../helpers/loggerHelper.js";
class PiniaAdapter extends StoreAdapter {
  /**
   * Creates a PiniaAdapter instance.
   * @param {StoreAdapter} adapter The storage adapter to use for persistence (e.g., IndexedDBAdapter)
   * @throws {Error} Throws if no adapter is provided
   */
  constructor(adapter) {
    super();
    if (!adapter) {
      logError("Adapter provided is not defined");
      throw new Error("Adapter provided is not defined");
    }
    this.adapter = adapter;
    this.stores = {};
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Validates that a Pinia store has the required methods.
   * @private
   * @param {Object} store Pinia store instance to validate
   * @throws {Error} Throws if store is invalid or missing required methods
   */
  _checkStore(store) {
    if (!store || !store.$subscribe || !store.$patch) {
      logError("Store provided is not defined");
      throw new Error("Store provided is not defined");
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Registers a listener on the adapter to respond to external data changes,
   * ensuring the connected store is synchronized with updates that come
   * from other sources (e.g., different tabs or windows).
   *
   * @private
   * @param {String} key - The key to register the listener for
   */
  _registerOnDataChanged(key) {
    logInfo("PiniaAdapter - Registering onDataChanged listener");
    if (!key || !this.stores || !this.stores[key]) {
      return;
    }
    this.adapter.onDataChanged(async (data) => {
      try {
        if (data.adapterId == this.adapter.adapterId || !data.origin) {
          return;
        }
        if (!this.stores || !this.stores[data.key] || !this.stores[data.key].store) {
          return;
        }
        let dataToPatch;
        if (!data.value) {
          dataToPatch = await this.adapter.get(data.key);
        } else {
          dataToPatch = await this.adapter._decrypt(data.key, data.value);
        }
        if (JSON.stringify(this.stores[data.key].store.$state) === JSON.stringify(dataToPatch)) {
          return;
        }
        this.stores[data.key].store.$state = {
          ...this.stores[data.key].store.$state,
          ...dataToPatch,
          STORAGEFY_SILENT_CHANNEL_UPDATE: true
        };
      } catch (error) {
        logError("PiniaAdapter - onDataChanged - error:", error);
      }
    });
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Syncs Pinia store state to persistent storage and sets up subscription for future changes.
   * @async
   * @param {Object} store Pinia store instance
   * @param {string} key Storage key to use
   * @param {Object} [options={}] Configuration options
   * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
   * @param {number} [options.timeout] Operation timeout in milliseconds
   * @param {Function} [options.onError] Called with an Error on every write that fails (storage full, encryption
   *   failure…) — the store keeps working, but its state was not saved
   * @returns {Promise<boolean>} Resolves to true on success
   * @throws {Error} Throws if store is invalid or persistence fails
   * @example
   * // Persist store while ignoring sensitive data
   * await piniaAdapter.setInStorage(useUserStore(), 'user-data', {
   *   ignoreKeys: ['password', 'token'],
   *   timeout: 5000
   * });
   */
  async setInStorage(store, key, options = {}) {
    try {
      logInfo("PiniaAdapter - setInStorage - key:", key);
      this._checkStore(store);
      options.ignoreKeys = options.ignoreKeys || [];
      if (this.stores[key] && this.stores[key].unsubscribe && typeof this.stores[key].unsubscribe === "function") {
        this.stores[key].unsubscribe();
      }
      delete this.stores[key];
      this.stores[key] = {
        key,
        options,
        store,
        unsubscribe: null
      };
      return new Promise((resolve, reject) => {
        this.stores[key].unsubscribe = store.$subscribe(
          async (mutation, state) => {
            try {
              if (!state) {
                return resolve(true);
              }
              if (state.STORAGEFY_SILENT_CHANNEL_UPDATE) {
                delete state.STORAGEFY_SILENT_CHANNEL_UPDATE;
                return resolve(true);
              }
              const stateProps = this.omitKeys(state, options.ignoreKeys);
              const written = await this.adapter.set(key, stateProps, options.timeout);
              if (written === false) {
                this._reportWriteFailure(key, options);
              }
              return resolve(true);
            } catch (error) {
              this._reportWriteFailure(key, options, error);
              return reject(error);
            }
          }
        );
        store.$patch({ ...store.$state });
        if (options.syncTabs) {
          this._registerOnDataChanged(key);
        }
      });
    } catch (error) {
      logError(error);
      throw error;
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Loads persisted state into a Pinia store.
   * @async
   * @param {Object} store Pinia store instance to hydrate
   * @param {string} key Storage key to load from
   * @returns {Promise<boolean>} Resolves to true on success, undefined if no data found
   * @throws {Error} Throws if store is invalid or loading fails
   * @example
   * // Hydrate store from persisted state
   * await piniaAdapter.getFromStorage(useUserStore(), 'user-data');
   */
  async getFromStorage(store, key) {
    try {
      logInfo("PiniaAdapter - getFromStorage - key:", key);
      this._checkStore(store);
      const storage = await this.adapter.get(key);
      if (!storage) {
        return;
      }
      store.$patch(assign({}, storage));
      return true;
    } catch (error) {
      logError(error);
      throw error;
    }
  }
}
var PiniaAdapter_default = PiniaAdapter;
export {
  PiniaAdapter_default as default
};
//# sourceMappingURL=PiniaAdapter.js.map