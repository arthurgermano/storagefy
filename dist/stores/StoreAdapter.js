import { logError } from "../helpers/loggerHelper.js";
import { reportFailure } from "../helpers/failureReport.js";
import { assign } from "misc-helpers";
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
class StoreAdapter {
  /**
   * @param {import("../adapters/StorageAdapter.js").default} adapter - The storage adapter (IndexedDB, localStorage,
   *   sessionStorage).
   * @throws {Error} If no storage adapter is given.
   */
  constructor(adapter) {
    if (!adapter) {
      logError("Adapter provided is not defined");
      throw new Error("Adapter provided is not defined");
    }
    this.adapter = adapter;
    this.stores = {};
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Keeps a store in storage under a key and every change after — replacing what was kept under that key before.
   * @abstract
   * @param {any} store
   * @param {string} key
   * @param {SetInStorageOptions} [options]
   * @returns {Promise<boolean>}
   */
  async setInStorage(store, key, options = {}) {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Loads what storage kept under a key into a store.
   * @abstract
   * @param {any} store
   * @param {string} key
   * @param {GetFromStorageOptions} [options]
   * @returns {Promise<true|undefined>} true when a state was loaded; undefined when there was none.
   */
  async getFromStorage(store, key, options = {}) {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Starts keeping a store: what was kept under the key before stops (its subscriptions end).
   * @protected
   * @param {string} key
   * @param {any} store
   * @param {SetInStorageOptions} options - Not changed: the adapter keeps its own copy.
   * @returns {KeptStore}
   */
  _keep(key, store, options) {
    this.destroy(key);
    const kept = {
      key,
      store,
      options: { ...options, ignoreKeys: [...options.ignoreKeys ?? []] },
      unsubscribe: null,
      stopTabs: null,
      latest: void 0,
      writing: null,
      applying: false,
      incoming: Promise.resolve()
    };
    this.stores[key] = kept;
    return kept;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * A change of a kept store, as its subscription hears it: written — unless it is another tab's state being applied
   * (it is not written back). A null or undefined state removes the stored key (a store emptied on sign-out is not
   * loaded back), as the storage adapters' set does; 0, false and "" are written as they are.
   *
   * The state given must be the store's own (read from it): a store adapter never passes a guess.
   * @protected
   * @param {KeptStore} kept
   * @param {any} state
   * @returns {Promise<void> | null} The write (see _persist), or null when nothing is written.
   */
  _onChange(kept, state) {
    if (kept.applying) {
      return null;
    }
    return this._persist(kept, state === void 0 ? null : state);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The other tab's state on top of the store's: two plain objects are merged (what ignoreKeys left out of storage
   * stays in memory); anything else is replaced whole.
   * @protected
   * @param {any} current
   * @param {any} incoming
   * @returns {any}
   */
  _merged(current, incoming) {
    return isPlainObject(current) && isPlainObject(incoming) ? { ...current, ...incoming } : incoming;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Writes the state of a kept store. While a write is in progress, only the newest state is kept for the next one:
   * a burst of changes costs one write after the current, never one per change, and the last state always wins.
   * @protected
   * @param {KeptStore} kept
   * @param {any} state
   * @returns {Promise<void>} Done when the state given (or a newer one) was written; rejects when a write threw.
   */
  _persist(kept, state) {
    kept.latest = state;
    kept.writing ??= (async () => {
      try {
        while (kept.latest !== void 0) {
          const next = kept.latest;
          kept.latest = void 0;
          const written = await this.adapter.set(kept.key, this.omitKeys(next, kept.options.ignoreKeys), kept.options.timeout);
          if (written === false) {
            this._reportWriteFailure(kept.key, kept.options);
          }
        }
      } catch (error) {
        kept.latest = void 0;
        this._reportWriteFailure(kept.key, kept.options, error);
        throw error;
      } finally {
        kept.writing = null;
      }
    })();
    return kept.writing;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Applies to a kept store the changes the other tabs tell (when syncTabs is on) — only those of its key and its
   * namespace (dbName), one after another in the order they came: reading or decrypting a change takes time, and an
   * older change must never land after a newer one. A change whose state this store already holds — ignoreKeys left
   * out, as stored — is not applied; a key removed in the other tab leaves this store's state as it is.
   * @protected
   * @param {KeptStore} kept
   * @param {() => any} current - The store's state now.
   * @param {(incoming: any) => void} apply - Puts the other tab's state in the store (kept.applying is true meanwhile,
   *   so the store's subscription does not write it back).
   */
  _listenToTabs(kept, current, apply) {
    if (!kept.options.syncTabs) {
      return;
    }
    kept.stopTabs = this.adapter.onDataChanged((change) => {
      if (!change?.origin || change.key !== kept.key || change.dbName !== this.adapter.dbName) {
        return;
      }
      kept.incoming = kept.incoming.then(() => this._applyChange(kept, change, current, apply));
    });
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Applies one change of another tab (see _listenToTabs). Never rejects: a failure is told through onError.
   * @private
   * @param {KeptStore} kept
   * @param {import("../adapters/StorageAdapter.js").DataChange} change
   * @param {() => any} current
   * @param {(incoming: any) => void} apply
   * @returns {Promise<void>}
   */
  async _applyChange(kept, change, current, apply) {
    let incoming;
    try {
      incoming = change.value === void 0 ? await this.adapter.get(kept.key, { onError: kept.options.onError }) : await this.adapter._decrypt(kept.key, change.value);
    } catch (error) {
      reportFailure("read", kept.key, kept.options.onError, error);
      return;
    }
    if (this.stores[kept.key] !== kept || incoming === null) {
      return;
    }
    if (JSON.stringify(this.omitKeys(current(), kept.options.ignoreKeys)) === JSON.stringify(incoming)) {
      return;
    }
    kept.applying = true;
    try {
      apply(incoming);
    } catch (error) {
      reportFailure("apply", kept.key, kept.options.onError, error);
    } finally {
      kept.applying = false;
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Tells that a write of the store to storage failed: the storage adapters never throw on a write — they answer
   * false — so without this the app would never know its state was not saved.
   * @protected
   * @param {string} key - The storage key that was not saved.
   * @param {SetInStorageOptions} options
   * @param {unknown} [cause] - The error thrown, when the write threw.
   */
  _reportWriteFailure(key, options, cause) {
    reportFailure("save", key, options.onError, cause);
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
    kept.unsubscribe?.();
    kept.stopTabs?.();
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
   * Recursively omits keys from an object based on an array of dot-notation key paths.
   *
   * @param {Object} obj The object to process
   * @param {string[]} ignoreKeys Array of keys to omit. Supports dot-notation for nested keys.
   * @returns {Object} A new object with the specified keys set to undefined (left out of the JSON)
   * @example
   * omitKeys({ password: '123', name: 'John' }, ['password'])
   * // => { password: undefined, name: 'John' }
   * omitKeys({ user: { password: '123', name: 'John' } }, ['user.password'])
   * // => { user: { password: undefined, name: 'John' } }
   */
  omitKeys(obj, ignoreKeys) {
    if (!obj || typeof obj !== "object" || !ignoreKeys?.length) return obj;
    const result = Array.isArray(obj) ? [...obj] : assign({}, obj);
    for (const key of Object.keys(result)) {
      if (ignoreKeys.includes(key)) {
        result[key] = void 0;
        continue;
      }
      const nestedKeys = ignoreKeys.filter((k) => k.startsWith(key + ".")).map((k) => k.slice(key.length + 1));
      if (nestedKeys.length && result[key] && typeof result[key] === "object") {
        result[key] = this.omitKeys(result[key], nestedKeys);
      }
    }
    return result;
  }
}
var StoreAdapter_default = StoreAdapter;
export {
  StoreAdapter_default as default,
  isPlainObject
};
//# sourceMappingURL=StoreAdapter.js.map