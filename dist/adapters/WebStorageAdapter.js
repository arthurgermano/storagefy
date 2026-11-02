import StorageAdapter from "./StorageAdapter.js";
import { logAndThrow, logError, logInfo } from "../helpers/loggerHelper.js";
class WebStorageAdapter extends StorageAdapter {
  /**
   * @param {import("./StorageAdapter.js").StorageAdapterOptions} options
   * @param {WebStorageKind} kind
   * @throws {Error} If the storage is not available, or an encryption option is invalid.
   */
  constructor(options, kind) {
    if (typeof globalThis[kind.storageName] === "undefined") {
      logAndThrow(`${kind.label} is not available in this environment`);
    }
    super(options);
    const { dbName, version = 1, description = "" } = options;
    this.kind = kind;
    this.sharedBetweenTabs = kind.shared;
    this._initMeta({ dbName, version, description });
    this._startExpireWatcher();
    logInfo(`${kind.label}Adapter - initialized with dbName: ${dbName}, encrypt: ${this.encrypt}`);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The storage, looked up on each use.
   * @private
   * @returns {Storage}
   */
  get _storage() {
    return globalThis[this.kind.storageName];
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Writes the metadata of the namespace.
   * @private
   */
  _initMeta({ dbName, version, description }) {
    try {
      const meta = { dbName, version, description, createdAt: Date.now() };
      this._storage.setItem(this.metaKey, JSON.stringify(meta));
    } catch (err) {
      logError("Error initializing meta:", err);
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * A record of the namespace (expirations, revisions) — empty when there is none, or it is not JSON (logged).
   * @private
   * @param {string} recordKey
   * @returns {Object<string, any>}
   */
  _loadRecord(recordKey) {
    try {
      const raw = this._storage.getItem(recordKey);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      logError(`Error loading ${recordKey}:`, err);
      return {};
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Removes the entry of a key from a record of the namespace — written only when the key had one.
   * @private
   * @param {string} recordKey
   * @param {string} key - The key of the entry (expirations: the storage key; revisions: as stored).
   */
  _forgetEntry(recordKey, key) {
    const record = this._loadRecord(recordKey);
    if (this._removeEntry(record, key)) {
      this._storage.setItem(recordKey, JSON.stringify(record));
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The expiration timestamps of the namespace.
   * @protected
   * @returns {Object<string, number>}
   */
  _loadExpires() {
    return this._loadRecord(this.expireKey);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Writes the expiration timestamps.
   * @private
   * @param {Object<string, number>} expires
   */
  _saveExpires(expires) {
    this._storage.setItem(this.expireKey, JSON.stringify(expires));
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Calls back when a write of another tab reaches this tab's localStorage — its value or the revisions record (the
   * `storage` event; a clear too). Between tabs, localStorage orders no write of one with another's: one may arrive
   * after its message, and after a newer write of this tab. Never for this tab's own writes, nor with sessionStorage
   * (each tab has its own); outside a browser there is no tab.
   * @protected
   * @param {string} key
   * @param {() => void} callback
   * @returns {() => void} Stops it.
   */
  _onStoredChange(key, callback) {
    const win = globalThis.window;
    if (!this.sharedBetweenTabs || !win) {
      return () => {
      };
    }
    const fullKey = this._fullKey(key);
    const onStorage = (event) => {
      if (event.storageArea === this._storage && [fullKey, this.revisionKey, null].includes(event.key)) {
        callback();
      }
    };
    win.addEventListener("storage", onStorage);
    return () => win.removeEventListener("storage", onStorage);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * What is stored under a key, with its revision — after the writes of the key asked before.
   * @protected
   * @param {string} key
   * @param {import("./StorageAdapter.js").ReadOptions} [options]
   * @returns {Promise<import("./StorageAdapter.js").StoredRead>} The value is null if absent, expired or unreadable.
   */
  async _read(key, options = {}) {
    await this._afterWrites(key);
    try {
      const raw = this._storage.getItem(this._fullKey(key));
      if (!raw) return { value: null };
      if (this._isExpired(this._loadExpires()[key])) {
        await this._expire(key);
        return { value: null };
      }
      const revision = this._revisionIn(this._loadRecord(this.revisionKey), key);
      return { value: await this._decrypt(key, raw), revision };
    } catch (err) {
      this._reportReadFailure(key, options, err);
      return { value: null };
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Writes a stored text now, with its expiration and its revision — read and raised with the write, in one run that
   * nothing in this tab interrupts. Another tab's write may land in between all the same (localStorage orders no write
   * of one tab with another's): see _onStoredChange.
   * @protected
   * @param {string} key
   * @param {string} stored
   * @param {number|null} expiresAt
   * @returns {Promise<import("../helpers/revisions.js").NextRevision>}
   * @throws {Error} If the storage refused it (e.g. it is full: QuotaExceededError).
   */
  async _writeNow(key, stored, expiresAt) {
    const fullKey = this._fullKey(key);
    const revisions = this._loadRecord(this.revisionKey);
    const next = this.revisions.next(key, revisions[fullKey]);
    if (this._storage.getItem(fullKey) === stored) {
      this._storage.removeItem(fullKey);
    }
    this._storage.setItem(fullKey, stored);
    if (expiresAt !== null) {
      this._saveExpires({ ...this._loadExpires(), [key]: expiresAt });
    } else {
      this._forgetEntry(this.expireKey, key);
    }
    this._storage.setItem(this.revisionKey, JSON.stringify({ ...revisions, [fullKey]: next.revision }));
    return next;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The stored value goes with the message: sessionStorage is not shared between tabs, and a write to localStorage
   * may reach the other tabs after the message does (Firefox) — read there, it would be the old one.
   * @protected
   * @param {string} stored
   * @returns {string}
   */
  _messageValue(stored) {
    return stored;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Removes a key, its expiration and its revision, and tells the other tabs.
   * @protected
   * @param {string} key
   * @returns {Promise<void>}
   */
  async _deleteNow(key) {
    this._storage.removeItem(this._fullKey(key));
    this._forgetEntry(this.expireKey, key);
    this._forgetEntry(this.revisionKey, this._fullKey(key));
    if (this.enableSyncTabs) {
      this.emitDataChange(key, void 0, "delete");
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Removes a key found expired, if it still is when its turn in the queue comes (see StorageAdapter._expire).
   * @protected
   * @param {string} key
   * @returns {Promise<void>}
   */
  async _expire(key) {
    return this._inOrder(key, async () => {
      try {
        if (this._isExpired(this._loadExpires()[key])) {
          await this._deleteNow(key);
        }
      } catch (err) {
        logError(`Error expiring key '${key}':`, err);
      }
    });
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Every key of the storage, as stored. Reading the storage throws only when the page may not use it
   * (SecurityError): passed on, as before.
   * @protected
   * @returns {Promise<string[]>}
   */
  async _storedKeys() {
    const keys = [];
    for (let i = 0; i < this._storage.length; i++) {
      keys.push(this._storage.key(i));
    }
    return keys;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Checks whether a key is stored and not expired (an expired key is left for get or the watcher to remove) — after
   * the writes of the key asked before.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    await this._afterWrites(key);
    try {
      return this._storage.getItem(this._fullKey(key)) !== null && !this._isExpired(this._loadExpires()[key]);
    } catch (err) {
      logError(`Error checking key '${key}':`, err);
      return false;
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Removes every key of the namespace and the expirations and revisions records (and the metadata, when asked), now,
   * and tells the other tabs.
   * @protected
   * @param {boolean} withMeta - Remove the metadata too (clear).
   * @returns {Promise<void>}
   */
  async _resetNow(withMeta) {
    try {
      const keys = [];
      for (const stored of await this._storedKeys()) {
        const key = this._ownKey(stored);
        if (key !== null) {
          keys.push({ stored, key });
        }
      }
      this._storage.removeItem(this.expireKey);
      this._storage.removeItem(this.revisionKey);
      for (const { stored, key } of keys) {
        this._storage.removeItem(stored);
        if (this.enableSyncTabs) {
          this.emitDataChange(key, void 0, "reset");
        }
      }
      if (withMeta) {
        this._storage.removeItem(this.metaKey);
      }
    } catch (err) {
      logError(withMeta ? "Error clearing storage:" : "Error resetting storage:", err);
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Sets the expiration timestamp of a key.
   * @param {string} key
   * @param {number} timestamp - When it expires (ms since the epoch).
   * @returns {Promise<void>}
   */
  async setExpire(key, timestamp) {
    try {
      this._saveExpires({ ...this._loadExpires(), [key]: timestamp });
    } catch (err) {
      logError(`Error setting expire for key '${key}':`, err);
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Removes the expiration of a key.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async deleteExpire(key) {
    try {
      this._forgetEntry(this.expireKey, key);
    } catch (err) {
      logError(`Error deleting expire for key '${key}':`, err);
    }
  }
}
var WebStorageAdapter_default = WebStorageAdapter;
export {
  WebStorageAdapter_default as default
};
//# sourceMappingURL=WebStorageAdapter.js.map