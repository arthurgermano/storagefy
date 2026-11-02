import { reportFailure } from "../helpers/failureReport.js";
import { omitKeys } from "../helpers/state.js";
import TabFollower from "./TabFollower.js";

// ------------------------------------------------------------------------------------------------

/** @typedef {import("../helpers/revisions.js").Revision} Revision */
/** @typedef {import("./StoreAdapter.js").SetInStorageOptions} SetInStorageOptions */

/**
 * How a kept store is reached — what its store adapter knows of its library.
 * @typedef {Object} KeptStoreParts
 * @property {string} key - The storage key.
 * @property {any} store - The library's store.
 * @property {SetInStorageOptions} options - Not changed: a copy is kept.
 * @property {import("../adapters/StorageAdapter.js").default} adapter - The storage adapter.
 * @property {() => any} current - The store's state now.
 * @property {(incoming: any) => void} apply - Puts a stored state in the store (it may throw: told through onError).
 */

// ------------------------------------------------------------------------------------------------

/**
 * A store kept in storage under a key: what is known of its stored state, and its writes. A store adapter creates one
 * per key it keeps (see StoreAdapter._keep); with syncTabs, its TabFollower applies the other tabs' changes to it.
 */
class KeptStore {
  /**
   * @param {KeptStoreParts} parts
   */
  constructor({ key, store, options, adapter, current, apply }) {
    this.key = key;
    this.store = store;
    /** @type {SetInStorageOptions & { ignoreKeys: string[] }} */
    this.options = { ...options, ignoreKeys: [...(options.ignoreKeys ?? [])] };
    this.adapter = adapter;
    this.current = current;
    /** Whether the store is still kept: false once stopped (destroy, or kept again) */
    this.active = true;
    /** @type {TabFollower | null} Applies the other tabs' changes (syncTabs) */
    this.follower = null;
    /** @type {Revision|undefined} The revision of the state the store holds: only a newer one is applied */
    this.revision = undefined;
    this._apply = apply;
    /** @type {(() => void) | null} Stops listening to the store */
    this._unsubscribe = null;
    // The newest state not written yet (undefined: none), and the write in progress
    this._latest = undefined;
    /** @type {Promise<void> | null} */
    this._writing = null;
    // True while a stored state is put in the store: that change is not written back
    this._applying = false;
    // The start read and the other tabs' changes, one after another
    /** @type {Promise<void>} */
    this._queue = Promise.resolve();
    // The stored part of the store's state (ignoreKeys left out), as JSON, as this store last wrote it, applied it or
    // found it stored: a change that leaves it as it is writes nothing. undefined: not known (the next change is
    // written)
    /** @type {string|undefined} */
    this._stored = undefined;
    // Listening from now: the changes told before start's read are applied after it
    if (this.options.syncTabs) {
      this.follower = new TabFollower(this);
    }
  }

  // ----------------------------------------------------------------------------------------------
  // Its life
  // ----------------------------------------------------------------------------------------------

  /**
   * Reads what storage holds now — what the first write is compared with (see firstWrite). When getFromStorage loaded
   * the key before and storage holds something else now, another tab wrote in between: that newer state is put in the
   * store, not written over. The read is first in the queue of the other tabs' changes: those told meanwhile are
   * applied after it.
   * @param {string|undefined} loaded - What getFromStorage loaded, as JSON (undefined: it did not load the key).
   * @returns {Promise<void>} Never rejects.
   */
  start(loaded) {
    return this.queue(async () => {
      let readable = true;
      const { value, revision } = await this.adapter._read(this.key, {
        onError: () => {
          readable = false;
        },
      });
      // A value that cannot be read (another password, changed by hand) is written over, as before
      if (!readable) {
        return;
      }
      this._stored = JSON.stringify(value);
      this.revision = revision;
      if (loaded !== undefined && value !== null && this._stored !== loaded) {
        this.put(value);
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Keeps how to stop listening to the store (see stop).
   * @param {() => void} unsubscribe
   */
  subscribed(unsubscribe) {
    this._unsubscribe = unsubscribe;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Stops keeping the store: no more writes, no more changes from the other tabs. What is stored stays.
   */
  stop() {
    this.active = false;
    this._unsubscribe?.();
    this.follower?.stop();
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Runs a task after the ones queued before it (the start read, the other tabs' changes): reading or decrypting a
   * change takes time, and an older one must never land after a newer one.
   * @param {() => Promise<void>} task - Never rejects.
   * @returns {Promise<void>}
   */
  queue(task) {
    this._queue = this._queue.then(task);
    return this._queue;
  }

  // ----------------------------------------------------------------------------------------------
  // Its writes
  // ----------------------------------------------------------------------------------------------

  /**
   * The stored part of a state (ignoreKeys left out), as JSON — what a write would store.
   * @param {any} state
   * @returns {string|undefined} undefined when the state is not JSON (the write fails and tells why).
   */
  storedForm(state) {
    try {
      return JSON.stringify(omitKeys(state, this.options.ignoreKeys));
    } catch {
      return undefined;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * A change of the store, as its subscription hears it: written — unless it is a stored state being put in the store
   * (it is not written back), or the stored part of the state did not change (only ignoreKeys did, or nothing). A
   * null or undefined state removes the stored key (a store emptied on sign-out is not loaded back), as the storage
   * adapters' set does; 0, false and "" are written as they are.
   *
   * The state given must be the store's own (read from it): a store adapter never passes a guess.
   * @param {any} state
   * @returns {Promise<void> | null} The write (see persist), or null when nothing is written.
   */
  onChange(state) {
    if (this._applying) {
      return null;
    }
    const value = state === undefined ? null : state;
    const stored = this.storedForm(value);
    // A write of what is already stored would tell the other tabs this state again — after they may have replaced it
    // with a newer one
    if (stored !== undefined && stored === this._stored) {
      return null;
    }
    this._stored = stored;
    return this.persist(value);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * A change of the store heard by its subscription, written as onChange says — a failed write is told through
   * onError, never thrown at the library.
   * @param {any} state
   */
  changed(state) {
    this.onChange(state)?.catch(() => {});
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The first write (after start): the store's state is written — unless storage already holds its stored part, then
   * only the expiration is set again, as that write would have done. A tab that opens never writes a state that is
   * already stored, and so never undoes a newer change another tab made meanwhile.
   * @param {any} state - The store's state now.
   * @returns {Promise<void>} Rejects when the write threw (see persist).
   */
  firstWrite(state) {
    return this.onChange(state) ?? this._renewExpiration(state);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Sets the expiration of a stored state left as it is, as a write of it would (see SetInStorageOptions.timeout).
   * @private
   * @param {any} state - The store's state now.
   * @returns {Promise<void>}
   */
  async _renewExpiration(state) {
    const { timeout } = this.options;
    // Nothing stored: nothing expires
    if (this._stored === "null") {
      return;
    }
    if (typeof timeout !== "number") {
      await this.adapter.deleteExpire(this.key);
    } else if (timeout > 0) {
      await this.adapter.setExpire(this.key, Date.now() + timeout);
    } else {
      // 0 or less: the write removes the key (see the storage adapters' set)
      await this.persist(state);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Writes a state of the store. While a write is in progress, only the newest state is kept for the next one: a
   * burst of changes costs one write after the current, never one per change, and the last state always wins.
   * @param {any} state
   * @returns {Promise<void>} Done when the state given (or a newer one) was written; rejects when a write threw.
   */
  persist(state) {
    this._latest = state;
    this._writing ??= (async () => {
      try {
        while (this._latest !== undefined) {
          const next = this._latest;
          this._latest = undefined;
          const { ignoreKeys, timeout } = this.options;
          const written = await this.adapter.set(this.key, omitKeys(next, ignoreKeys), timeout);
          if (written === false) {
            // Not stored: the next change is written, whatever it is
            this._stored = undefined;
            this.report("save");
          } else if (written) {
            this.revision = this.adapter.revisions.written(this.key);
          }
        }
      } catch (error) {
        this._latest = undefined;
        this._stored = undefined;
        this.report("save", error);
        throw error;
      } finally {
        this._writing = null;
      }
    })();
    return this._writing;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Whether a write of the store is in progress.
   * @returns {boolean}
   */
  get writing() {
    return this._writing !== null;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Waits until no write of the store is in progress (a write that failed included: it was told through onError).
   * @returns {Promise<void>}
   */
  async ownWritesDone() {
    while (this._writing) {
      await this._writing.catch(() => {});
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Whether the state the store holds is its own last write (not another tab's, nor what storage held as it
   * started).
   * @returns {boolean}
   */
  holdsOwnWrite() {
    return this.revision !== undefined && this.revision === this.adapter.revisions.written(this.key);
  }

  // ----------------------------------------------------------------------------------------------
  // The stored states put in it
  // ----------------------------------------------------------------------------------------------

  /**
   * Takes a stored state (another tab's, or what storage holds): put in the store unless the store holds it already
   * (ignoreKeys left out, as stored), then known as stored — of its revision, when it has one.
   * @param {any} incoming
   * @param {Revision} [revision]
   */
  adopt(incoming, revision) {
    let stored = JSON.stringify(incoming);
    if (this.storedForm(this.current()) !== stored) {
      if (!this.put(incoming)) {
        return;
      }
      stored = this.storedForm(this.current());
    }
    this._stored = stored;
    if (revision) {
      this.revision = revision;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Puts a stored state in the store — while it does, the store's subscription does not write it back. A failure is
   * told through onError.
   * @param {any} incoming
   * @returns {boolean} Whether it was put.
   */
  put(incoming) {
    let put = false;
    this._applying = true;
    try {
      this._apply(incoming);
      put = true;
    } catch (error) {
      this.report("apply", error);
    } finally {
      this._applying = false;
    }
    return put;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Tells the app that the store's state could not be saved, read or applied: the storage adapters never throw on a
   * write — they answer false — so without this the app would never know.
   * @param {"read"|"save"|"apply"} action
   * @param {unknown} [cause] - The error thrown, when there was one.
   */
  report(action, cause) {
    reportFailure(action, this.key, this.options.onError, cause);
  }
}

// ------------------------------------------------------------------------------------------------

export default KeptStore;

// ------------------------------------------------------------------------------------------------
