import StoreAdapter, { isPlainObject } from "./StoreAdapter.js";
import { reportFailure } from "../helpers/failureReport.js";
import { logError } from "../helpers/loggerHelper.js";

// ------------------------------------------------------------------------------------------------

/** The state of a Pinia store is an object: a stored value of another kind was not written by this adapter */
const NOT_AN_OBJECT = "Storagefy: the stored state of a Pinia store must be an object";

// ------------------------------------------------------------------------------------------------

/**
 * Pinia storage adapter: keeps a Pinia store's state in a storage adapter.
 * @class PiniaAdapter
 * @extends StoreAdapter
 * @example
 * const piniaAdapter = new PiniaAdapter(new IndexedDBAdapter({ dbName: "my-app" }));
 * await piniaAdapter.getFromStorage(useUserStore(), "user-state");
 * await piniaAdapter.setInStorage(useUserStore(), "user-state", { ignoreKeys: ["draft"] });
 */
class PiniaAdapter extends StoreAdapter {
  /**
   * @param {import("../adapters/StorageAdapter.js").default} adapter - The storage adapter.
   * @throws {Error} If no storage adapter is given.
   */
  constructor(adapter) {
    super(adapter);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Validates that a Pinia store has the required methods.
   * @private
   * @param {any} store
   * @throws {Error} If it is not a Pinia store.
   */
  _checkStore(store) {
    if (!store || !store.$subscribe || !store.$patch) {
      logError("Store provided is not defined");
      throw new Error("Store provided is not defined");
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Writes the store's state now and on every change after (see StoreAdapter._persist).
   * @param {any} store - The Pinia store.
   * @param {string} key - Storage key.
   * @param {import("./StoreAdapter.js").SetInStorageOptions} [options]
   * @returns {Promise<boolean>} true once the state is written for the first time.
   * @throws {Error} If it is not a Pinia store, or the first write threw.
   * @example
   * await piniaAdapter.setInStorage(useUserStore(), "user-data", { ignoreKeys: ["password", "token"] });
   */
  async setInStorage(store, key, options = {}) {
    this._checkStore(store);
    const kept = this._keep(key, store, options);

    return new Promise((resolve, reject) => {
      kept.unsubscribe = store.$subscribe((mutation, state) => {
        const write = this._onChange(kept, state);
        if (!write) {
          resolve(true);
          return;
        }
        write.then(() => resolve(true), reject);
      });

      this._listenToTabs(
        kept,
        () => store.$state,
        (incoming) => {
          if (!isPlainObject(incoming)) {
            throw new Error(NOT_AN_OBJECT);
          }
          store.$state = this._merged(store.$state, incoming);
        },
      );

      // Writes the state as it is now
      store.$patch({ ...store.$state });
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Loads persisted state into a Pinia store.
   * @param {any} store - The Pinia store.
   * @param {string} key - Storage key.
   * @param {import("./StoreAdapter.js").GetFromStorageOptions} [options]
   * @returns {Promise<true|undefined>} true when a state was loaded; undefined when there was none.
   * @throws {Error} If it is not a Pinia store.
   */
  async getFromStorage(store, key, options = {}) {
    this._checkStore(store);
    const storage = await this.adapter.get(key, { onError: options.onError });
    if (storage === null) {
      return;
    }
    if (!isPlainObject(storage)) {
      reportFailure("read", key, options.onError, new Error(NOT_AN_OBJECT));
      return;
    }
    // Read from storage just now: a value of its own, shared with nothing
    store.$patch(storage);
    return true;
  }
}

// ------------------------------------------------------------------------------------------------

export default PiniaAdapter;

// ------------------------------------------------------------------------------------------------
