import StoreAdapter from "./StoreAdapter.js";
import { assign } from "misc-helpers";
import { logError, logInfo } from "../helpers/loggerHelper.js";
class ReactAdapter extends StoreAdapter {
  /**
   * Creates a ReactAdapter instance.
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
    this.stores = {};
  }
  // ----------------------------------------------------------------------------------------------
  _getPayload(current, payload) {
    return {
      ...current,
      ...payload,
      STORAGEFY_SILENT_CHANNEL_UPDATE: true
    };
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Registers a listener on the adapter to respond to external data changes,
   * ensuring the connected store is synchronized with updates that come
   * from other sources (e.g., different tabs or windows).
   *
   * @private
   * @param {Object} store - A reactive store (e.g., a Redux, Jotai, Zustand or Custom store) that will be updated when external changes occur.
   */
  _registerOnDataChanged(key) {
    if (!key || !this.stores || !this.stores[key]) {
      return;
    }
    logInfo("ReactAdapter - Registering onDataChanged listener");
    this.adapter.onDataChanged(async (data) => {
      try {
        if (data.adapterId == this.adapter.adapterId || !data.origin) {
          return;
        }
        if (!this.stores || !this.stores[data.key] || !this.stores[data.key].store) {
          return;
        }
        const store = this.stores[data.key].store;
        let dataToPatch;
        if (!data.value) {
          dataToPatch = await this.adapter.get(data.key);
        } else {
          dataToPatch = await this.adapter._decrypt(data.key, data.value);
        }
        if (typeof store.dispatch === "function" && typeof store.getState === "function") {
          const currentState2 = store.getState();
          if (JSON.stringify(currentState2) === JSON.stringify(dataToPatch)) {
            return;
          }
          store.dispatch({
            type: "STORAGEFY_UPDATE",
            payload: this._getPayload(currentState2, dataToPatch)
          });
          return;
        }
        if (typeof store.getState === "function" && typeof store.setState === "function") {
          const currentState2 = store.getState();
          if (JSON.stringify(currentState2) === JSON.stringify(dataToPatch)) {
            return;
          }
          store.setState(this._getPayload(currentState2, dataToPatch));
          return;
        }
        if (typeof store.set === "function" && typeof store.get === "function") {
          const currentState2 = store.get();
          if (JSON.stringify(currentState2) === JSON.stringify(dataToPatch)) {
            return;
          }
          store.set(this._getPayload(currentState2, dataToPatch));
          return;
        }
        if (typeof store.update === "function") {
          store.update((state) => {
            if (JSON.stringify(state) === JSON.stringify(dataToPatch)) {
              return state;
            }
            return this._getPayload(state, dataToPatch);
          });
          return;
        }
        const currentState = typeof store.getState === "function" ? store.getState() : typeof store.get === "function" ? store.get() : {};
        if (JSON.stringify(currentState) === JSON.stringify(dataToPatch)) {
          return;
        }
        if (typeof store.set === "function") {
          store.set(this._getPayload(currentState, dataToPatch));
        } else {
          logError("Unable to update store: No compatible update method found");
        }
      } catch (error) {
        logError("Error in _registerOnDataChanged:", error);
      }
    });
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Syncs React store state to persistent storage and sets up subscription for future changes.
   * Supports both Redux-style (getState/subscribe) and Zustand-style stores.
   * @async
   * @param {Object} store React state store instance (Redux, Zustand, etc.)
   * @param {string} key Storage key to use
   * @param {Object} [options={}] Configuration options
   * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
   * @param {number} [options.timeout] Operation timeout in milliseconds
   * @param {Function} [options.onError] Called with an Error on every write that fails (storage full, encryption
   *   failure…) — the store keeps working, but its state was not saved
   * @returns {Promise<boolean>} Resolves to true when subscription is established
   * @throws {Error} Throws if store is invalid or unsupported
   * @example
   * // Persist Redux store while ignoring sensitive data
   * await reactAdapter.setInStorage(reduxStore, 'user-state', {
   *   ignoreKeys: ['authToken', 'password'],
   *   timeout: 3000
   * });
   *
   * // Persist Zustand store
   * await reactAdapter.setInStorage(zustandStore, 'app-settings');
   */
  async setInStorage(store, key, options = {}) {
    try {
      logInfo("ReactAdapter - setInStorage - key:", key);
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
        const handleStateChange = async (state) => {
          try {
            if (!state) return;
            if (state.STORAGEFY_SILENT_CHANNEL_UPDATE) {
              delete state.STORAGEFY_SILENT_CHANNEL_UPDATE;
              return resolve(true);
            }
            const stateProps = this.omitKeys(state, options.ignoreKeys);
            const written = await this.adapter.set(key, stateProps, options.timeout);
            if (written === false) {
              this._reportWriteFailure(key, options);
            }
          } catch (error) {
            this._reportWriteFailure(key, options, error);
          }
        };
        if (typeof store.subscribe === "function" && typeof store.getState === "function") {
          handleStateChange(store.getState());
          this.stores[key].unsubscribe = store.subscribe(() => {
            handleStateChange(store.getState());
          });
        } else if (typeof store.subscribe === "function") {
          this.stores[key].unsubscribe = store.subscribe(handleStateChange);
        } else {
          reject(new Error("Unsupported store type"));
          return;
        }
        if (options.syncTabs) {
          this._registerOnDataChanged(key);
        }
        resolve(true);
      });
    } catch (error) {
      logError(error);
      throw error;
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Hydrates a React store from persistent storage.
   * Supports both Redux (dispatch) and Zustand (setState) update patterns.
   * @async
   * @param {Object} store React state store instance to hydrate
   * @param {string} key Storage key to load from
   * @returns {Promise<boolean>} Resolves to true on success, undefined if no data found
   * @throws {Error} Throws if store is invalid or update fails
   * @example
   * // Hydrate Redux store
   * await reactAdapter.getFromStorage(reduxStore, 'user-state');
   *
   * // Hydrate Zustand store
   * await reactAdapter.getFromStorage(zustandStore, 'app-settings');
   */
  async getFromStorage(store, key) {
    try {
      logInfo("ReactAdapter - getFromStorage - key:", key);
      this._checkStore(store);
      const storage = await this.adapter.get(key);
      if (!storage) {
        return;
      }
      if (typeof store.dispatch === "function") {
        store.dispatch({
          type: "SET_STATE_FROM_STORAGE",
          payload: storage
        });
      } else if (typeof store.setState === "function") {
        store.setState(assign({}, storage));
      } else {
        throw new Error(
          "Cannot update store: setState or dispatch method not found"
        );
      }
      return true;
    } catch (error) {
      logError(error);
      throw error;
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Validates that a store has the required interface methods.
   * @private
   * @param {Object} store Store instance to validate
   * @throws {Error} Throws if store is invalid or missing required methods
   */
  _checkStore(store) {
    if (!store) {
      logError("Store provided is not defined");
      throw new Error("Store provided is not defined");
    }
    if (typeof store.getState === "function" && typeof store.dispatch === "function" && typeof store.subscribe === "function") {
      return;
    }
    if (typeof store.getState === "function" && typeof store.setState === "function" && typeof store.subscribe === "function") {
      return;
    }
    if (Array.isArray(store) && store.length === 2 && typeof store[0] === "function" && typeof store[1] === "function") {
      return;
    }
    const hasGetState = typeof store.getState === "function" || typeof store._getState === "function";
    const hasSetState = typeof store.setState === "function" || typeof store._setState === "function";
    const hasSubscribe = typeof store.subscribe === "function";
    if (!hasSubscribe) {
      logError("Store must have a subscribe method");
      throw new Error("Store must have a subscribe method");
    }
    if (!hasGetState && !hasSetState) {
      logError(
        "Store must have either getState/setState or _getState/_setState methods"
      );
      throw new Error(
        "Store must have either getState/setState or _getState/_setState methods"
      );
    }
  }
}
var ReactAdapter_default = ReactAdapter;
export {
  ReactAdapter_default as default
};
//# sourceMappingURL=ReactAdapter.js.map