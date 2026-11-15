import { logAndThrow } from "../helpers/loggerHelper.js";
import { omitKeys } from "../helpers/state.js";
import KeptStore from "./KeptStore.js";
class StoreAdapter {
  /**
   * @param {import("../adapters/StorageAdapter.js").default} adapter - The storage adapter (IndexedDB, localStorage,
   *   sessionStorage).
   * @throws {Error} If no storage adapter is given.
   */
  constructor(adapter) {
    if (!adapter) {
      logAndThrow("Adapter provided is not defined");
    }
    this.adapter = adapter;
    this.stores = {};
    this._loaded = /* @__PURE__ */ new Map();
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Keeps a store in storage under a key: its state is written now (unless storage already holds it) and on every
   * change after — replacing what was kept under that key before.
   * @param {any} store
   * @param {string} key - Storage key.
   * @param {SetInStorageOptions} [options]
   * @returns {Promise<boolean>} true once the store is subscribed to and its state written (or found stored).
   * @throws {Error} If the store is not one of the adapter's library, or the first write threw — a mistake of the app
   *   (a storage adapter of its own that throws, a state that cannot be copied). A write the storage did not save
   *   (full, encryption unavailable…) throws nothing: it is told through onError, like every write after.
   * @example
   * await piniaAdapter.setInStorage(useUserStore(), "user-data", { ignoreKeys: ["password", "token"] });
   */
  async setInStorage(store, key, options = {}) {
    this._checkStore(store);
    const kept = this._keep(key, store, options);
    await kept.keeping(this._startKeeping(store, key, kept));
    return true;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Makes sure the state of a store is in storage: what the store holds now is written, unless it is stored already,
   * and the answer comes once its writes are done. The store's state is read, not waited for: a change the store has
   * not told yet (Pinia tells a direct change in a later task) is written too — and when it is told, it writes nothing
   * more. Call it before something that must not lose a change, such as signing out.
   *
   * A store whose state cannot be read (a React store without getState nor get, which gives its state to its listeners
   * only) is never written by flush — what is not read is not guessed: its writes in progress are waited for.
   *
   * Before setInStorage of the key is done, flush waits for it first. After destroy, or once the key is kept again, it
   * only waits for the writes in progress.
   * @param {string} [key] - The store's storage key. Without it: every store of this adapter.
   * @returns {Promise<boolean>} true when the state is stored — the one the store held when flush was called, or a
   *   newer one; false when a write was not saved (told through onError). It never rejects for a write.
   * @throws {Error} If no store is kept under key — a mistake of the app.
   * @example
   * userStore.$reset();
   * await piniaAdapter.flush("user-data"); // the cleared state is stored: the page may close
   */
  async flush(key) {
    if (key === void 0) {
      const answers = await Promise.all(Object.values(this.stores).map((kept2) => kept2.flush()));
      return answers.every(Boolean);
    }
    const kept = this.stores[key];
    if (!kept) {
      logAndThrow(`Storagefy: no store is kept under the key "${key}"`);
    }
    return kept.flush();
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Loads what storage kept under a key into a store.
   * @param {any} store
   * @param {string} key - Storage key.
   * @param {GetFromStorageOptions} [options]
   * @returns {Promise<true|undefined>} true when a state was loaded; undefined when there was none (or it was not one
   *   the store takes, told through onError).
   * @throws {Error} If the store is not one of the adapter's library, or cannot be set.
   */
  async getFromStorage(store, key, options = {}) {
    this._checkStore(store);
    const value = await this.adapter.get(key, { onError: options.onError });
    if (value === null) {
      this._loaded.set(key, "null");
      return;
    }
    if (!this._load(store, key, value, options)) {
      return;
    }
    this._loaded.set(key, JSON.stringify(value));
    return true;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Stops keeping the store of a key: no more writes, no more changes from the other tabs. What is stored stays.
   * @param {string} key
   */
  destroy(key) {
    const kept = this.stores[key];
    if (!kept) {
      return;
    }
    kept.stop();
    delete this.stores[key];
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Stops keeping every store of this adapter (see destroy). The storage adapter is not destroyed: it may be shared.
   */
  destroyAll() {
    for (const key of Object.keys(this.stores)) {
      this.destroy(key);
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The state with the keys of ignoreKeys left out (see helpers/state.js omitKeys).
   * @private
   * @param {Object} obj The object to process
   * @param {string[]} ignoreKeys Array of keys to omit. Supports dot-notation for nested keys.
   * @returns {Object} A new object with the specified keys set to undefined (left out of the JSON)
   */
  omitKeys(obj, ignoreKeys) {
    return omitKeys(obj, ignoreKeys);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * What setInStorage does once the store is kept: reads what storage holds, subscribes to the store and makes its
   * first write.
   * @private
   * @param {any} store
   * @param {string} key
   * @param {KeptStore} kept
   * @returns {Promise<void>} Rejects when the first write threw.
   */
  async _startKeeping(store, key, kept) {
    await kept.start(this._takeLoaded(key));
    if (!kept.active) {
      return;
    }
    const { unsubscribe, firstWrite } = this._subscribe(store, kept);
    kept.subscribed(unsubscribe);
    await firstWrite;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Starts keeping a store: what was kept under the key before stops (its subscriptions end).
   * @protected
   * @param {string} key
   * @param {any} store
   * @param {SetInStorageOptions} options
   * @returns {KeptStore}
   */
  _keep(key, store, options) {
    this.destroy(key);
    const kept = new KeptStore({
      key,
      store,
      options,
      adapter: this.adapter,
      current: () => this._currentOf(store),
      readable: this._canRead(store),
      apply: (incoming) => this._apply(store, incoming)
    });
    this.stores[key] = kept;
    return kept;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * What getFromStorage loaded under a key, once: for setInStorage to tell whether another tab wrote since.
   * @private
   * @param {string} key
   * @returns {string|undefined} As JSON; undefined when getFromStorage did not load the key.
   */
  _takeLoaded(key) {
    const loaded = this._loaded.get(key);
    this._loaded.delete(key);
    return loaded;
  }
  // ----------------------------------------------------------------------------------------------
  // What each adapter knows of its library
  // ----------------------------------------------------------------------------------------------
  /**
   * Refuses what is not a store of the adapter's library.
   * @abstract
   * @protected
   * @param {any} store
   * @throws {Error} If it is not one.
   */
  _checkStore(store) {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Whether the store's state can be read whenever asked (see _currentOf) — flush writes only a state it read.
   * @protected
   * @param {any} store
   * @returns {boolean}
   */
  _canRead(store) {
    return true;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The store's state now.
   * @abstract
   * @protected
   * @param {any} store
   * @returns {any}
   */
  _currentOf(store) {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Puts a stored state (another tab's, or what storage holds) on top of the store's, the way its library updates.
   * @abstract
   * @protected
   * @param {any} store
   * @param {any} incoming
   * @throws {Error} If the store does not take it (told through onError).
   */
  _apply(store, incoming) {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Subscribes to the store: each change is written (KeptStore.changed), and the first write is made as the library
   * allows (KeptStore.firstWrite).
   * @abstract
   * @protected
   * @param {any} store
   * @param {KeptStore} kept
   * @returns {Subscription}
   */
  _subscribe(store, kept) {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Sets a state loaded from storage in the store.
   * @abstract
   * @protected
   * @param {any} store
   * @param {string} key
   * @param {any} value - Not null.
   * @param {GetFromStorageOptions} options
   * @returns {boolean} Whether it was set — false when it is not a state the store takes (told through onError).
   * @throws {Error} If the store cannot be set.
   */
  _load(store, key, value, options) {
    throw new Error("Not implemented");
  }
}
var StoreAdapter_default = StoreAdapter;
export {
  StoreAdapter_default as default
};
//# sourceMappingURL=StoreAdapter.js.map