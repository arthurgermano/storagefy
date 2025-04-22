import StoreAdapter from "./StoreAdapter.js";
import assign from "misc-helpers/src/utils/assign.js";
import { logError, logInfo, logWarn } from "../helpers/loggerHelper.js";

// ------------------------------------------------------------------------------------------------

/**
 * Svelte store adapter that syncs Svelte writable stores with persistent storage.
 * Provides seamless integration between Svelte's store contract and various storage backends.
 * @class SvelteAdapter
 * @extends StoreAdapter
 * @example
 * // Basic usage with a Svelte writable store
 * import { writable } from 'svelte/store';
 * import { IndexedDBAdapter } from 'storagefy';
 *
 * const userStore = writable({});
 * const svelteAdapter = new SvelteAdapter(new IndexedDBAdapter({ dbName: 'svelte-app' }));
 *
 * // Persist store state
 * await svelteAdapter.setInStorage(userStore, 'user-data');
 *
 * // Hydrate store from storage
 * await svelteAdapter.getFromStorage(userStore, 'user-data');
 */
class SvelteAdapter extends StoreAdapter {
  /**
   * Creates a SvelteAdapter instance.
   * @param {StoreAdapter} adapter The storage adapter to use for persistence (IndexedDB, LocalStorage, etc.)
   * @throws {Error} Throws if no adapter is provided
   */
  constructor(adapter) {
    super();
    if (!adapter) {
      logError("Adapter provided is not defined");
      throw new Error("Adapter provided is not defined");
    }
    this.adapter = adapter;
    this._unsubscribe = {};
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Registers a listener on the adapter to respond to external data changes,
   * ensuring the connected store is synchronized with updates that come
   * from other sources (e.g., different tabs or windows).
   *
   * @private
   * @param {Object} store - A reactive store (e.g., a Svelte store) that will be updated when external changes occur.
   */
  _registerOnDataChanged(store) {
    logInfo("SvelteAdapter - Registering onDataChanged listener");
    try {
      if (!store) {
        return;
      }
      this.adapter.onDataChanged(async (data) => {
        if (data.adapterId == this.adapter.adapterId || !data.origin) {
          return;
        }

        let currentState;
        const unsubscribe = store.subscribe((value) => {
          currentState = assign({}, value);
        });
        unsubscribe();

        let dataToPatch;
        if (!data.value) {
          dataToPatch = await this.adapter.get(data.key);
        } else {
          dataToPatch = await this.adapter._decrypt(data.key, data.value);
        }
        if (JSON.stringify(currentState) === JSON.stringify(dataToPatch)) {
          return;
        }

        // Update store with the patched data
        // In Svelte, we update the store directly
        store.update((currentState) => ({
          ...currentState,
          ...dataToPatch,
          STORAGEFY_SILENT_CHANNEL_UPDATE: true,
        }));
      });
    } catch (error) {
      logError("SvelteAdapter - onDataChanged error:", error);
      throw error;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Syncs a Svelte store to persistent storage and sets up subscription for future changes.
   * @async
   * @param {Object} store Svelte writable store instance
   * @param {string} key Storage key to use
   * @param {Object} [options={}] Configuration options
   * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
   * @param {number} [options.timeout] Operation timeout in milliseconds
   * @returns {Promise<boolean>} Resolves to true when initial sync completes
   * @throws {Error} Throws if store is invalid or persistence fails
   * @example
   * // Persist store while ignoring sensitive fields
   * await svelteAdapter.setInStorage(userStore, 'user-profile', {
   *   ignoreKeys: ['password', 'token'],
   *   timeout: 2000
   * });
   */
  async setInStorage(store, key, options = {}) {
    try {
      logInfo("SvelteAdapter - setInStorage - key:", key);
      this._checkStore(store);
      options.ignoreKeys = options.ignoreKeys || [];

      // Clean up previous subscription if exists
      if (this._unsubscribe[key]) {
        this._unsubscribe[key]();
        delete this._unsubscribe[key];
      }

      return new Promise((resolve, reject) => {
        const unsubscribe = store.subscribe(async (state) => {
          try {
            if (!state) {
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

        this._unsubscribe[key] = unsubscribe;

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
   * Hydrates a Svelte store from persistent storage.
   * @async
   * @param {Object} store Svelte writable store instance to hydrate
   * @param {string} key Storage key to load from
   * @returns {Promise<boolean>} Resolves to true on success, undefined if no data found
   * @throws {Error} Throws if store is invalid or update fails
   * @example
   * // Load persisted state into store
   * await svelteAdapter.getFromStorage(userStore, 'user-profile');
   */
  async getFromStorage(store, key) {
    try {
      logInfo("SvelteAdapter - getFromStorage - key:", key);
      this._checkStore(store);
      const storage = await this.adapter.get(key);
      if (!storage) {
        return;
      }
      store.set(assign({}, storage));
      return true;
    } catch (error) {
      logError(error);
      throw error;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Validates that a store conforms to Svelte's writable store contract.
   * @private
   * @param {Object} store Store instance to validate
   * @throws {Error} Throws if store doesn't have required subscribe and set methods
   */
  _checkStore(store) {
    if (
      !store ||
      typeof store.subscribe !== "function" ||
      typeof store.set !== "function"
    ) {
      logError("Store provided is not a valid Svelte writable store");
      throw new Error("Store provided is not a valid Svelte writable store");
    }
  }
}

// ------------------------------------------------------------------------------------------------

export default SvelteAdapter;

// ------------------------------------------------------------------------------------------------
