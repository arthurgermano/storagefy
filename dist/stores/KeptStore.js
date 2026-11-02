import { reportFailure } from "../helpers/failureReport.js";
import { omitKeys } from "../helpers/state.js";
import TabFollower from "./TabFollower.js";
class KeptStore {
  /**
   * @param {KeptStoreParts} parts
   */
  constructor({ key, store, options, adapter, current, apply }) {
    this.key = key;
    this.store = store;
    this.options = { ...options, ignoreKeys: [...options.ignoreKeys ?? []] };
    this.adapter = adapter;
    this.current = current;
    this.active = true;
    this.follower = null;
    this.revision = void 0;
    this._apply = apply;
    this._unsubscribe = null;
    this._latest = void 0;
    this._writing = null;
    this._applying = false;
    this._queue = Promise.resolve();
    this._stored = void 0;
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
        }
      });
      if (!readable) {
        return;
      }
      this._stored = JSON.stringify(value);
      this.revision = revision;
      if (loaded !== void 0 && value !== null && this._stored !== loaded) {
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
      return void 0;
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
    const value = state === void 0 ? null : state;
    const stored = this.storedForm(value);
    if (stored !== void 0 && stored === this._stored) {
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
    this.onChange(state)?.catch(() => {
    });
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
    if (this._stored === "null") {
      return;
    }
    if (typeof timeout !== "number") {
      await this.adapter.deleteExpire(this.key);
    } else if (timeout > 0) {
      await this.adapter.setExpire(this.key, Date.now() + timeout);
    } else {
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
        while (this._latest !== void 0) {
          const next = this._latest;
          this._latest = void 0;
          const { ignoreKeys, timeout } = this.options;
          const written = await this.adapter.set(this.key, omitKeys(next, ignoreKeys), timeout);
          if (written === false) {
            this._stored = void 0;
            this.report("save");
          } else if (written) {
            this.revision = this.adapter.revisions.written(this.key);
          }
        }
      } catch (error) {
        this._latest = void 0;
        this._stored = void 0;
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
      await this._writing.catch(() => {
      });
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Whether the state the store holds is its own last write (not another tab's, nor what storage held as it
   * started).
   * @returns {boolean}
   */
  holdsOwnWrite() {
    return this.revision !== void 0 && this.revision === this.adapter.revisions.written(this.key);
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
var KeptStore_default = KeptStore;
export {
  KeptStore_default as default
};
//# sourceMappingURL=KeptStore.js.map