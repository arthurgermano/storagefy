import { logError } from "../helpers/loggerHelper.js";
import { reportFailure } from "../helpers/failureReport.js";
import { assign } from "misc-helpers";
import { isNewerRevision, isRevision } from "../adapters/StorageAdapter.js";

// ------------------------------------------------------------------------------------------------

/**
 * How a store is kept in storage.
 * @typedef {Object} SetInStorageOptions
 * @property {string[]} [ignoreKeys] - State left out of storage (memory only). Dot notation reaches nested keys
 *   ("user.password").
 * @property {number} [timeout] - Expiration of the stored state, in milliseconds after each write — not a time limit
 *   of the operation: after it, the stored state is gone.
 * @property {boolean} [syncTabs] - Apply the changes of the other tabs to this store. Needs the storage adapter's
 *   channelName and enableSyncTabs.
 * @property {(error: Error) => void} [onError] - Called when the state could not be saved (the storage is full, the
 *   encryption failed…) or a change from another tab could not be read or applied. The store keeps working.
 */

/**
 * How a store is loaded from storage.
 * @typedef {Object} GetFromStorageOptions
 * @property {(error: Error) => void} [onError] - Called when a stored state is there but cannot be read (it does not
 *   decrypt, it is not JSON…). The store keeps its state.
 */

/**
 * A store kept in storage.
 * @typedef {Object} KeptStore
 * @property {string} key
 * @property {any} store
 * @property {SetInStorageOptions & { ignoreKeys: string[] }} options
 * @property {(() => void) | null} unsubscribe - Stops listening to the store.
 * @property {(() => void) | null} stopTabs - Stops listening to the other tabs.
 * @property {any} latest - The newest state not written yet (undefined: none).
 * @property {Promise<void> | null} writing - The write in progress.
 * @property {boolean} applying - True while another tab's state is put in the store: that change is not written back.
 * @property {Promise<void>} incoming - The changes of the other tabs, applied one after another.
 * @property {string|undefined} stored - The stored part of the store's state (ignoreKeys left out), as JSON, as this
 *   store last wrote it, applied it or found it stored: a change that leaves it as it is writes nothing. undefined:
 *   not known (the next change is written).
 * @property {import("../adapters/StorageAdapter.js").Revision|undefined} revision - The revision of the state the store
 *   holds: only a newer one from another tab is applied.
 */

// ------------------------------------------------------------------------------------------------

/**
 * Whether a value is a plain object (not null, not an array) — the state merged with another tab's; anything else
 * (an array, a number, a string, a boolean) is replaced whole.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ------------------------------------------------------------------------------------------------

/**
 * Base class of the store adapters (Pinia, React, Svelte): which stores are kept, their writes and the changes of the
 * other tabs. Each adapter adds how its library is read, written and subscribed to.
 *
 * @abstract
 */
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
    /** @type {Record<string, KeptStore>} */
    this.stores = {};
    // What getFromStorage loaded under each key (as JSON) and setInStorage has not started from yet
    /** @type {Map<string, string>} */
    this._loaded = new Map();
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
      options: { ...options, ignoreKeys: [...(options.ignoreKeys ?? [])] },
      unsubscribe: null,
      stopTabs: null,
      latest: undefined,
      writing: null,
      applying: false,
      incoming: Promise.resolve(),
      stored: undefined,
      revision: undefined,
    };
    this.stores[key] = kept;
    return kept;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Keeps in mind what getFromStorage loaded under a key, for setInStorage to tell whether another tab wrote since.
   * @protected
   * @param {string} key
   * @param {any} loaded - The value read (null: none).
   */
  _rememberLoaded(key, loaded) {
    this._loaded.set(key, JSON.stringify(loaded));
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Starts following a kept store: the other tabs' changes (see _listenToTabs), and what storage holds now — what its
   * first write is compared with (see _firstWrite). When getFromStorage loaded the key before and storage holds
   * something else now, another tab wrote in between: that newer state is put in the store, not written over.
   * The read is first in the queue of the other tabs' changes: those told meanwhile are applied after it.
   * @protected
   * @param {KeptStore} kept
   * @param {() => any} current - The store's state now.
   * @param {(incoming: any) => void} apply - Puts a stored state in the store (see _listenToTabs).
   * @returns {Promise<void>} Never rejects.
   */
  _start(kept, current, apply) {
    this._listenToTabs(kept, current, apply);
    const loaded = this._loaded.get(kept.key);
    this._loaded.delete(kept.key);
    kept.incoming = kept.incoming.then(async () => {
      let readable = true;
      const { value, revision } = await this.adapter._read(kept.key, {
        onError: () => {
          readable = false;
        },
      });
      // A value that cannot be read (another password, changed by hand) is written over, as before
      if (!readable) {
        return;
      }
      kept.stored = JSON.stringify(value);
      kept.revision = revision;
      if (loaded !== undefined && value !== null && kept.stored !== loaded) {
        this._put(kept, value, apply);
      }
    });
    return kept.incoming;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The stored part of a state (ignoreKeys left out), as JSON — what a write would store.
   * @private
   * @param {KeptStore} kept
   * @param {any} state
   * @returns {string|undefined} undefined when the state is not JSON (the write fails and tells why).
   */
  _storedForm(kept, state) {
    try {
      return JSON.stringify(this.omitKeys(state, kept.options.ignoreKeys));
    } catch {
      return undefined;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * A change of a kept store, as its subscription hears it: written — unless it is another tab's state being applied
   * (it is not written back), or the stored part of the state did not change (only ignoreKeys did, or nothing). A
   * null or undefined state removes the stored key (a store emptied on sign-out is not loaded back), as the storage
   * adapters' set does; 0, false and "" are written as they are.
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
    const value = state === undefined ? null : state;
    const stored = this._storedForm(kept, value);
    // A write of what is already stored would tell the other tabs this state again — after they may have replaced it
    // with a newer one
    if (stored !== undefined && stored === kept.stored) {
      return null;
    }
    kept.stored = stored;
    return this._persist(kept, value);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The first write of a kept store (after _start): its state is written — unless storage already holds its stored
   * part, then only the expiration is set again, as that write would have done. A tab that opens never writes a state
   * that is already stored, and so never undoes a newer change another tab made meanwhile.
   * @protected
   * @param {KeptStore} kept
   * @param {any} state - The store's state now.
   * @returns {Promise<void>} Rejects when the write threw (see _persist).
   */
  _firstWrite(kept, state) {
    return this._onChange(kept, state) ?? this._renewExpiration(kept, state);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Sets the expiration of a stored state left as it is, as a write of it would (see SetInStorageOptions.timeout).
   * @private
   * @param {KeptStore} kept
   * @param {any} state - The store's state now.
   * @returns {Promise<void>}
   */
  async _renewExpiration(kept, state) {
    const { timeout } = kept.options;
    // Nothing stored: nothing expires
    if (kept.stored === "null") {
      return;
    }
    if (typeof timeout !== "number") {
      await this.adapter.deleteExpire(kept.key);
    } else if (timeout > 0) {
      await this.adapter.setExpire(kept.key, Date.now() + timeout);
    } else {
      // 0 or less: the write removes the key (see the storage adapters' set)
      await this._persist(kept, state);
    }
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
        while (kept.latest !== undefined) {
          const next = kept.latest;
          kept.latest = undefined;
          const written = await this.adapter.set(kept.key, this.omitKeys(next, kept.options.ignoreKeys), kept.options.timeout);
          if (written === false) {
            // Not stored: the next change is written, whatever it is
            kept.stored = undefined;
            this._reportWriteFailure(kept.key, kept.options);
          } else if (written) {
            kept.revision = this.adapter._writtenRevision(kept.key);
          }
        }
      } catch (error) {
        kept.latest = undefined;
        kept.stored = undefined;
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
   * older change must never land after a newer one. With a storage the tabs share (IndexedDB, localStorage), storage
   * is read again when the tab is shown again: in the background or in the browser's page cache, it may have missed
   * messages. See _applyChange for what is applied.
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
    /** @param {import("../adapters/StorageAdapter.js").DataChange | null} change - null: read storage again */
    const follow = (change) => {
      kept.incoming = kept.incoming.then(() => this._applyChange(kept, change, current, apply));
    };
    const stopChannel = this.adapter.onDataChanged((change) => {
      // A tab never hears its own messages (BroadcastChannel does not deliver to the sender)
      if (!change?.origin || change.key !== kept.key || change.dbName !== this.adapter.dbName) {
        return;
      }
      // Known as soon as it is heard: a write of this tab after it is newer
      this.adapter._noteRevision(kept.key, change.revision);
      follow(change);
    });
    const stopShown = this._onTabShown(() => follow(null));
    // Another tab's write reaching storage after this store's newer one would leave storage with the older state:
    // storage is read again (see _writeAgainIfOverwritten)
    const stopStored = this.adapter._onStoredChange(kept.key, () => {
      if (this._holdsOwnWrite(kept)) {
        follow(null);
      }
    });
    kept.stopTabs = () => {
      stopChannel();
      stopShown();
      stopStored();
    };
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Calls back each time the tab is shown again — back from the background, or from the browser's page cache — when
   * the tabs share the storage (IndexedDB, localStorage). Each tab has a sessionStorage of its own, with nothing of
   * the other tabs to read; outside a browser there is no tab.
   * @private
   * @param {() => void} callback
   * @returns {() => void} Stops it.
   */
  _onTabShown(callback) {
    const doc = globalThis.document;
    if (!this.adapter.sharedBetweenTabs || !doc) {
      return () => {};
    }
    const onVisibility = () => {
      if (doc.visibilityState === "visible") {
        callback();
      }
    };
    /** @param {PageTransitionEvent} event */
    const onPageShow = (event) => {
      if (event.persisted) {
        callback();
      }
    };
    doc.addEventListener("visibilitychange", onVisibility);
    doc.defaultView.addEventListener("pageshow", onPageShow);
    return () => {
      doc.removeEventListener("visibilitychange", onVisibility);
      doc.defaultView.removeEventListener("pageshow", onPageShow);
    };
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Waits until no write of the store is in progress (a write that failed included: it was told through onError).
   * @private
   * @param {KeptStore} kept
   * @returns {Promise<void>}
   */
  async _ownWrites(kept) {
    while (kept.writing) {
      await kept.writing.catch(() => {});
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Applies one change of another tab, or what storage holds when the tab is shown again (see _listenToTabs) — only
   * when it is newer than the state the store holds (see Revision): a message heard late, or a state another tab
   * wrote before it knew this one, never undoes a newer state (when it may have reached storage after the store's own
   * write, that state is written again, see _writeAgainIfOverwritten). A state the
   * store already holds (ignoreKeys left out, as stored) is not applied again; a key removed in the other tab leaves
   * this store's state as it is. A change of 1.3.x (no revision) is applied as then: when the state differs. Never
   * rejects: a failure is told through onError.
   * @private
   * @param {KeptStore} kept
   * @param {import("../adapters/StorageAdapter.js").DataChange | null} change - null: read storage again.
   * @param {() => any} current
   * @param {(incoming: any) => void} apply
   * @returns {Promise<void>}
   */
  async _applyChange(kept, change, current, apply) {
    // localStorage and sessionStorage send the stored value; IndexedDB is read again (a write is told once its
    // transaction is saved, so a read after the message sees it), and so is the storage of a tab shown again
    const fromStorage = change === null || change.value === undefined;
    let incoming;
    let revision;
    try {
      // After the store's own writes — and again when one starts meanwhile: it lands after what was read, and is newer
      do {
        await this._ownWrites(kept);
        if (fromStorage) {
          ({ value: incoming, revision } = await this.adapter._read(kept.key, { onError: kept.options.onError }));
        } else {
          incoming = await this.adapter._decrypt(kept.key, change.value);
          revision = change.revision;
        }
      } while (kept.writing);
    } catch (error) {
      reportFailure("read", kept.key, kept.options.onError, error);
      return;
    }
    // Stopped meanwhile (destroy, or kept again), or removed in the other tab
    if (this.stores[kept.key] !== kept || incoming === null) {
      return;
    }
    const ordered = isRevision(revision);
    const incomingForm = JSON.stringify(incoming);
    if (ordered && !isNewerRevision(revision, kept.revision)) {
      await this._writeAgainIfOverwritten(kept, revision, incomingForm, fromStorage, current);
      return;
    }
    if (this._storedForm(kept, current()) === incomingForm) {
      // Held already: as stored, and of that revision
      kept.stored = incomingForm;
      if (ordered) {
        kept.revision = revision;
      }
      return;
    }
    if (this._put(kept, incoming, apply)) {
      kept.stored = this._storedForm(kept, current());
      if (ordered) {
        kept.revision = revision;
      }
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Writes the store's state again when another tab's write, older than the store's own last write, may have reached
   * storage after it — between tabs, localStorage orders no write of one with another's, and storage would keep the
   * state every tab left for the newer:
   *   - read from storage (the storage event, a tab shown again): it is there, it did;
   *   - told by its message: when it was not known as the store wrote, both were made at the same time and it may
   *     have — its write may even be on its way still. The storage event tells when it lands, but not always: Chromium
   *     leaves it out while this tab's own write is on its way.
   * Written again, storage ends with what the tabs hold — unless the older state is the store's (ignoreKeys left out):
   * storage holds it, whichever was saved last. Only with a storage the tabs share; with IndexedDB a write reads the
   * writes saved before it in its transaction, and none lands after a newer one. Never rejects: a failure is told
   * through onError (see _persist).
   * @private
   * @param {KeptStore} kept
   * @param {import("../adapters/StorageAdapter.js").Revision} revision - Of the other write: not newer than the
   *   store's.
   * @param {string} incomingForm - The other write's state, as JSON.
   * @param {boolean} fromStorage - Read from storage, not told by a message.
   * @param {() => any} current
   * @returns {Promise<void>}
   */
  async _writeAgainIfOverwritten(kept, revision, incomingForm, fromStorage, current) {
    const { adapter } = this;
    if (!adapter.sharedBetweenTabs || !this._holdsOwnWrite(kept) || !isNewerRevision(kept.revision, revision)) {
      return;
    }
    if (!fromStorage && !isNewerRevision(revision, adapter._writtenAfter(kept.key))) {
      // Known as the store wrote: saved before it
      return;
    }
    const state = current();
    if (this._storedForm(kept, state) !== incomingForm) {
      await this._persist(kept, state).catch(() => {});
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Whether the state a kept store holds is its own last write (not another tab's, nor what storage held as it
   * started).
   * @private
   * @param {KeptStore} kept
   * @returns {boolean}
   */
  _holdsOwnWrite(kept) {
    return kept.revision !== undefined && kept.revision === this.adapter._writtenRevision(kept.key);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Puts a state of storage (or of another tab) in the store — kept.applying is true meanwhile, so the store's
   * subscription does not write it back. A failure is told through onError.
   * @private
   * @param {KeptStore} kept
   * @param {any} incoming
   * @param {(incoming: any) => void} apply
   * @returns {boolean} Whether it was put.
   */
  _put(kept, incoming, apply) {
    let put = false;
    kept.applying = true;
    try {
      apply(incoming);
      put = true;
    } catch (error) {
      reportFailure("apply", kept.key, kept.options.onError, error);
    } finally {
      kept.applying = false;
    }
    return put;
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
        result[key] = undefined;
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

// ------------------------------------------------------------------------------------------------

export default StoreAdapter;

// ------------------------------------------------------------------------------------------------
