import StorageAdapter from "./StorageAdapter.js";
import { generateSimpleId } from "misc-helpers";
import { logError, logInfo } from "../helpers/loggerHelper.js";

// -------------------------------------------------------------------------------------------------

/**
 * Which Web Storage an adapter uses.
 * @typedef {Object} WebStorageKind
 * @property {"localStorage"|"sessionStorage"} storageName - The global it reads and writes.
 * @property {string} label - Its name in messages.
 */

// -------------------------------------------------------------------------------------------------

/**
 * @class WebStorageAdapter
 * @extends StorageAdapter
 * The storage adapter of localStorage and sessionStorage — the same code over either (LocalStorageAdapter and
 * SessionStorageAdapter choose which). Encryption, expirations, metadata and the changes told to other tabs.
 */
class WebStorageAdapter extends StorageAdapter {
  /**
   * @param {import("./StorageAdapter.js").StorageAdapterOptions} options
   * @param {WebStorageKind} kind
   * @throws {Error} If the storage is not available, or an encryption option is invalid.
   */
  constructor(
    {
      dbName,
      version = 1,
      encrypt = false,
      password = null,
      keyDerivation,
      expireCheckInterval = 1000,
      description = "",
      channelName = false,
      enableSyncTabs = false,
    },
    kind,
  ) {
    // Checked before anything is opened: a missing storage leaves no channel behind
    if (typeof globalThis[kind.storageName] === "undefined") {
      logError(`${kind.label} is not available in this environment`);
      throw new Error(`${kind.label} is not available in this environment`);
    }
    super(channelName);
    this.kind = kind;
    this.dbName = dbName;
    this.encrypt = encrypt;
    this._setEncryption(password, keyDerivation);
    this.expireKey = `STRGF_${dbName}__expires`;
    this.metaKey = `STRGF_${dbName}__meta`;
    this.prefix = `${dbName}__`;
    this.adapterId = generateSimpleId(dbName);
    this.expireCheckInterval = expireCheckInterval;
    this.enableSyncTabs = enableSyncTabs || false;

    this._initMeta({ dbName, version, description });
    this._startExpireWatcher();
    logInfo(`${kind.label}Adapter - initialized with dbName: ${dbName}, encrypt: ${encrypt}`);
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
   * The expiration timestamps of the namespace.
   * @private
   * @returns {Object<string, number>}
   */
  _loadExpires() {
    try {
      const raw = this._storage.getItem(this.expireKey);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      logError("Error loading expires:", err);
      return {};
    }
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
   * Forgets the expiration of a key — written only when the key had one.
   * @private
   * @param {string} key
   */
  _forgetExpire(key) {
    const expires = this._loadExpires();
    if (key in expires) {
      delete expires[key];
      this._saveExpires(expires);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieves a stored item — after the writes of the key asked before.
   * @param {string} key
   * @param {import("./StorageAdapter.js").ReadOptions} [options]
   * @returns {Promise<any|null>} The stored value, or null if absent, expired or unreadable.
   */
  async get(key, options = {}) {
    await this._afterWrites(key);
    try {
      const raw = this._storage.getItem(this._fullKey(key));
      if (!raw) return null;

      if (this._isExpired(this._loadExpires()[key])) {
        await this._expire(key);
        return null;
      }
      return await this._decrypt(key, raw);
    } catch (err) {
      this._reportReadFailure(key, options, err);
      return null;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Stores a value. Writes of a key are applied in the order they were called.
   * @param {string} key
   * @param {any} value - JSON; null or undefined removes the key.
   * @param {number} [expire] - Expiration in milliseconds from now; 0 or less removes the key.
   * @returns {Promise<boolean|null>} true when stored, false when it failed, null when the key was removed.
   */
  async set(key, value, expire) {
    return this._inOrder(key, async () => {
      try {
        if (!key && !value) return false;
        if (value === undefined || value === null || (typeof expire === "number" && expire <= 0)) {
          this._deleteNow(key);
          return null;
        }
        const stored = await this._encrypt(key, JSON.stringify(value));
        if (stored === null) return false;
        this._storage.setItem(this._fullKey(key), stored);

        if (typeof expire === "number") {
          this._saveExpires({ ...this._loadExpires(), [key]: Date.now() + expire });
        } else {
          this._forgetExpire(key);
        }
        if (this.enableSyncTabs) {
          // The stored value goes with the message: sessionStorage is not shared between tabs, and a write to
          // localStorage may reach the other tabs after the message does (Firefox) — read there, it would be the old one
          this.emitDataChange(key, stored, "set");
        }
        return true;
      } catch (err) {
        // e.g. the storage is full (QuotaExceededError)
        logError(`Error setting key '${key}':`, err);
        return false;
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes a key and its expiration, and tells the other tabs.
   * @private
   * @param {string} key
   */
  _deleteNow(key) {
    this._storage.removeItem(this._fullKey(key));
    this._forgetExpire(key);
    if (this.enableSyncTabs) {
      this.emitDataChange(key, undefined, "delete");
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
          this._deleteNow(key);
        }
      } catch (err) {
        logError(`Error expiring key '${key}':`, err);
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Deletes a value and its expiration — after the writes of the key asked before.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    return this._inOrder(key, async () => {
      try {
        this._deleteNow(key);
      } catch (err) {
        logError(`Error deleting key '${key}':`, err);
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The keys and values of the namespace whose key starts with a prefix.
   * @param {string} [prefix=""] - Prefix of the keys (without the namespace).
   * @returns {Promise<Array<{ key: string, value: any }>>}
   */
  async list(prefix = "") {
    // Reading the storage throws only when the page may not use it (SecurityError): passed on, as before
    const keys = [];
    for (let i = 0; i < this._storage.length; i++) {
      const key = this._ownKey(this._storage.key(i), prefix);
      if (key !== null) {
        keys.push(key);
      }
    }
    const results = [];
    for (const key of keys) {
      const value = await this.get(key);
      if (value !== null) {
        results.push({ key, value });
      }
    }
    return results;
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
   * Clears every key of the namespace, its metadata and its expirations — after the writes asked before (see
   * StorageAdapter._exclusive).
   * @returns {Promise<void>}
   */
  async clear() {
    return this._exclusive(async () => {
      this._resetNow();
      try {
        this._storage.removeItem(this.metaKey);
      } catch (err) {
        logError("Error clearing storage:", err);
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every key of the namespace and their expirations (the metadata stays), and tells the other tabs — after
   * the writes asked before (see StorageAdapter._exclusive).
   * @returns {Promise<void>}
   */
  async reset() {
    return this._exclusive(async () => this._resetNow());
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every key of the namespace and the expirations record, now.
   * @private
   */
  _resetNow() {
    try {
      const keys = [];
      for (let i = 0; i < this._storage.length; i++) {
        const stored = this._storage.key(i);
        const key = this._ownKey(stored);
        if (key !== null) {
          keys.push({ stored, key });
        }
      }
      // The expirations record holds only keys of the namespace: none is left
      this._storage.removeItem(this.expireKey);
      for (const { stored, key } of keys) {
        this._storage.removeItem(stored);
        if (this.enableSyncTabs) {
          this.emitDataChange(key, undefined, "reset");
        }
      }
    } catch (err) {
      logError("Error resetting storage:", err);
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
      this._forgetExpire(key);
    } catch (err) {
      logError(`Error deleting expire for key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every expired key.
   * @returns {Promise<void>}
   */
  async clearExpire() {
    // _loadExpires and _expire never throw: a broken expirations record reads as none
    const expires = this._loadExpires();
    for (const key of Object.keys(expires)) {
      if (this._isExpired(expires[key])) {
        await this._expire(key);
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------

export default WebStorageAdapter;

// ------------------------------------------------------------------------------------------------
