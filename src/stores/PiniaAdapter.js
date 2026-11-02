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
   * Writes the store's state now (unless storage already holds it) and on every change after (see
   * StoreAdapter._onChange).
   * @param {any} store - The Pinia store.
   * @param {string} key - Storage key.
   * @param {import("./StoreAdapter.js").SetInStorageOptions} [options]
   * @returns {Promise<boolean>} true once the state is written for the first time (or found stored).
   * @throws {Error} If it is not a Pinia store, or the first write threw.
   * @example
   * await piniaAdapter.setInStorage(useUserStore(), "user-data", { ignoreKeys: ["password", "token"] });
   */
  async setInStorage(store, key, options = {}) {
    this._checkStore(store);
    const kept = this._keep(key, store, options);
    await this._start(
      kept,
      () => store.$state,
      (incoming) => {
        if (!isPlainObject(incoming)) {
          throw new Error(NOT_AN_OBJECT);
        }
        store.$state = this._merged(store.$state, incoming);
      },
    );
    // Kept again, or no longer, while storage was read
    if (this.stores[key] !== kept) {
      return true;
    }
    kept.unsubscribe = store.$subscribe((mutation, state) => {
      // A failed write is told through onError
      this._onChange(kept, state)?.catch(() => {});
    });
    await this._firstWrite(kept, store.$state);
    return true;
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
      this._rememberLoaded(key, null);
      return;
    }
    if (!isPlainObject(storage)) {
      reportFailure("read", key, options.onError, new Error(NOT_AN_OBJECT));
      return;
    }
    // Read from storage just now: a value of its own, shared with nothing
    store.$patch(storage);
    this._rememberLoaded(key, storage);
    return true;
  }
}

// ------------------------------------------------------------------------------------------------

export default PiniaAdapter;

// ------------------------------------------------------------------------------------------------
