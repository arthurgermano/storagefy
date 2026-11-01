import StoreAdapter from "./StoreAdapter.js";
import { logError } from "../helpers/loggerHelper.js";
class SvelteAdapter extends StoreAdapter {
  /**
   * @param {import("../adapters/StorageAdapter.js").default} adapter - The storage adapter.
   * @throws {Error} If no storage adapter is given.
   */
  constructor(adapter) {
    super(adapter);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The store's value now.
   * @private
   * @param {any} store
   * @returns {any}
   */
  _valueOf(store) {
    let value;
    store.subscribe((current) => {
      value = current;
    })();
    return value;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Writes the store's value now and on every change after (see StoreAdapter._persist) — any value: an object, an
   * array, a number, a string, a boolean. null or undefined removes the stored key (a store emptied on sign-out is not
   * loaded back).
   * @param {any} store - A Svelte writable store.
   * @param {string} key - Storage key.
   * @param {import("./StoreAdapter.js").SetInStorageOptions} [options]
   * @returns {Promise<boolean>} true once the value is written for the first time (or found empty).
   * @throws {Error} If it is not a writable store, or the first write threw.
   */
  async setInStorage(store, key, options = {}) {
    this._checkStore(store);
    const kept = this._keep(key, store, options);
    return new Promise((resolve, reject) => {
      kept.unsubscribe = store.subscribe((state) => {
        const write = this._onChange(kept, state);
        if (!write) {
          resolve(true);
          return;
        }
        write.then(() => resolve(true), reject);
      });
      this._listenToTabs(
        kept,
        () => this._valueOf(store),
        (incoming) => store.update((current) => this._merged(current, incoming))
      );
    });
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Loads persisted state into a Svelte store.
   * @param {any} store - A Svelte writable store.
   * @param {string} key - Storage key.
   * @param {import("./StoreAdapter.js").GetFromStorageOptions} [options]
   * @returns {Promise<true|undefined>} true when a state was loaded; undefined when there was none.
   * @throws {Error} If it is not a writable store.
   */
  async getFromStorage(store, key, options = {}) {
    this._checkStore(store);
    const storage = await this.adapter.get(key, { onError: options.onError });
    if (storage === null) {
      return;
    }
    store.set(storage);
    return true;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * @private
   * @param {any} store
   * @throws {Error} If it is not a Svelte writable store.
   */
  _checkStore(store) {
    if (!store || typeof store.subscribe !== "function" || typeof store.set !== "function") {
      logError("Store provided is not a valid Svelte writable store");
      throw new Error("Store provided is not a valid Svelte writable store");
    }
  }
}
var SvelteAdapter_default = SvelteAdapter;
export {
  SvelteAdapter_default as default
};
//# sourceMappingURL=SvelteAdapter.js.map