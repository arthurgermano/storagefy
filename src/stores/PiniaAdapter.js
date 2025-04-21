import StoreAdapter from "./StoreAdapter.js";
import assign from "misc-helpers/src/utils/assign.js";
import { logError, logWarn, logInfo } from "../helpers/loggerHelper.js";

// ------------------------------------------------------------------------------------------------

/**
 * Pinia storage adapter that syncs Pinia store state with a persistence layer.
 * @class PiniaAdapter
 * @extends StoreAdapter
 * @example
 * // Basic usage with IndexedDB adapter:
 * const piniaAdapter = new PiniaAdapter(new IndexedDBAdapter({ dbName: 'my-app' }));
 * await piniaAdapter.setInStorage(useUserStore(), 'user-state');
 * await piniaAdapter.getFromStorage(useUserStore(), 'user-state');
 */
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
   * @param {Object} store - A reactive store (e.g., a Pinia) that will be updated when external changes occur.
   */
  _registerOnDataChanged(store) {
    logInfo("PiniaAdapter - Registering onDataChanged listener");
    if (!store) {
      return;
    }
    this.adapter.onDataChanged(async (data) => {
      try {
        if (data.adapterId == this.adapter.adapterId || !data.origin) {
          return;
        }

        let dataToPatch;
        if (!data.value) {
          dataToPatch = await this.adapter.get(data.key);
        } else {
          dataToPatch = await this.adapter._decrypt(data.key, data.value);
        }

        if (JSON.stringify(store.$state) === JSON.stringify(dataToPatch)) {
          return;
        }

        store.$state = {
          ...store.$state,
          ...dataToPatch,
          STORAGEFY_SILENT_CHANNEL_UPDATE: true,
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

      // Clean up previous subscription if exists
      if (this._unsubscribe) {
        this._unsubscribe();
      }

      return new Promise((resolve, reject) => {
        this._unsubscribe = store.$subscribe(async (mutation, state) => {
          try {
            if (!state) {
              return resolve(true);
            }
            if (state.STORAGEFY_SILENT_CHANNEL_UPDATE) {
              delete state.STORAGEFY_SILENT_CHANNEL_UPDATE;
              return resolve(true);
            }

            const stateProps = { ...state };
            for (let propKey in stateProps) {
              if (options.ignoreKeys.includes(propKey)) {
                stateProps[propKey] = undefined;
              }
            }

            await this.adapter.set(key, stateProps, options.timeout);

            return resolve(true);
          } catch (error) {
            return reject(error);
          }
        });

        store.$patch({ ...store.$state });

        if (options.syncTabs) {
          this._registerOnDataChanged(store);
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

// ------------------------------------------------------------------------------------------------

export default PiniaAdapter;

// ------------------------------------------------------------------------------------------------
