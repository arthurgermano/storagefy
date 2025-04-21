import StorageAdapter from "./StorageAdapter.js";
import generateSimpleId from "misc-helpers/src/utils/generateSimpleId.js";
import { simpleDeobfuscate } from "../helpers/cryptoHelper.js";
import { logError, logWarn, logInfo } from "../helpers/loggerHelper.js";

// -------------------------------------------------------------------------------------------------

/**
 * @class SessionStorageAdapter
 * @extends StorageAdapter
 * Adapter for browser sessionStorage with optional encryption and expiration support.
 */
class SessionStorageAdapter extends StorageAdapter {
  /**
   * @constructor
   * @param {Object} options
   * @param {string} options.dbName - The namespace for storage keys.
   * @param {number} [options.version=1] - Schema version of the storage.
   * @param {boolean} [options.encrypt=false] - Whether to encrypt stored values.
   * @param {number} [options.expireCheckInterval=1000] - Interval to check for expired items (ms).
   * @param {string} [options.description=""] - Optional description metadata.
   * @param {string} [options.channelName=false] - Optional channel name for cross-tab communication.
   * @param {boolean} [options.enableSyncTabs=false] - Whether to enable sync automatically on change key value
   * @throws Will throw if sessionStorage is not available.
   */
  constructor({
    dbName,
    version = 1,
    encrypt = false,
    expireCheckInterval = 1000,
    channelName = false,
    description = "",
    enableSyncTabs = false,
  }) {
    super(channelName);
    if (typeof sessionStorage === "undefined") {
      logError("SessionStorage is not available in this environment");
      throw new Error("SessionStorage is not available in this environment");
    }

    this.dbName = dbName;
    this.encrypt = encrypt;

    this.expireKey = `STRGF_${dbName}__expires`;
    this.metaKey = `STRGF_${dbName}__meta`;
    this.prefix = `${dbName}__`;
    this.adapterId = generateSimpleId(dbName);
    this.expireCheckInterval = expireCheckInterval;
    this.enableSyncTabs = enableSyncTabs || false;

    this._initMeta({ dbName, version, description });
    this._startExpireWatcher();

    this._unloadHandler = () => this.destroy();
    window.addEventListener("beforeunload", this._unloadHandler);
    logInfo(
      `SessionStorageAdapter - initialized with prefix: ${this.prefix}, encrypt: ${this.encrypt}`
    );
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Initializes metadata for the current storage instance.
   * @private
   * @param {Object} meta
   * @param {string} meta.dbName
   * @param {number} meta.version
   * @param {string} meta.description
   */
  _initMeta({ dbName, version, description }) {
    try {
      logInfo(
        `SessionStorageAdapter - Initializing metadata for ${dbName} v${version}`
      );
      const meta = {
        dbName,
        version,
        description,
        createdAt: Date.now(),
      };
      sessionStorage.setItem(this.metaKey, JSON.stringify(meta));
    } catch (err) {
      logError("Error initializing meta:", err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Loads expiration map from sessionStorage.
   * @private
   * @returns {Object<string, number>}
   */
  _loadExpires() {
    try {
      logInfo("SessionStorageAdapter - Loading expiration map");
      const raw = sessionStorage.getItem(this.expireKey);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      logError("Error loading expires:", err);
      return {};
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieves a value from storage, handling expiration.
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  async get(key) {
    try {
      logInfo(`SessionStorageAdapter - Getting key '${key}'`);
      const fullKey = this._fullKey(key);
      const raw = sessionStorage.getItem(fullKey);
      if (!raw) return null;

      const expires = await this.getExpire(key);
      if (expires && Date.now() >= expires) {
        await this.delete(key);
        return null;
      }

      return await this._decrypt(key, raw);
    } catch (err) {
      logError(`Error getting key '${key}':`, err);
      return null;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Stores a value, with optional expiration.
   * @param {string} key
   * @param {any} value
   * @param {number} [expire] - Time in ms until expiration.
   * @returns {Promise<boolean|null>}
   */
  async set(key, value, expire) {
    try {
      logInfo(`SessionStorageAdapter - Setting key: ${key}`, { value, expire });
      if (!key && !value) return false;

      const fullKey = this._fullKey(key);
      if (key && (value === undefined || value === null)) {
        await this.delete(fullKey);
        return null;
      }

      value = JSON.stringify(value);
      const encrypted = await this._encrypt(key, value);
      if (!encrypted) return false;

      sessionStorage.setItem(fullKey, encrypted);
      if (this.enableSyncTabs) {
        this.emitDataChange(key, encrypted, "set");
      }

      if (typeof expire !== "number") {
        await this.deleteExpire(key);
        return true;
      }

      if (expire > 0) {
        await this.setExpire(key, Date.now() + expire);
        return true;
      }

      await this.delete(key);
      return null;
    } catch (err) {
      logError(`Error setting key '${key}':`, err);
      return false;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Deletes a key from storage and its expiration.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    try {
      logInfo(`SessionStorageAdapter - Deleting key '${key}'`);
      const fullKey = this._fullKey(key);
      sessionStorage.removeItem(fullKey);

      const exp = this._loadExpires();
      delete exp[key];
      sessionStorage.setItem(this.expireKey, JSON.stringify(exp));
      if (this.enableSyncTabs) {
        this.emitDataChange(key, undefined, "delete");
      }
    } catch (err) {
      logError(`Error deleting key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Lists all stored key-value pairs under a prefix.
   * @returns {Promise<Array<{key: string, value: any}>>}
   */
  async list() {
    const results = [];
    try {
      logInfo(
        `SessionStorageAdapter - Listing keys with prefix '${this.prefix}'`
      );
      for (let i = 0; i < sessionStorage.length; i++) {
        let k = sessionStorage.key(i);
        if (this.encrypt) {
          k = simpleDeobfuscate(k);
        }
        if (k === this.metaKey || k === this.expireKey) continue;
        if (k.startsWith(this.prefix)) {
          const value = await this.get(k.replace(this.prefix, ""));
          if (value !== null) {
            results.push({ key: k.replace(this.prefix, ""), value });
          }
        }
      }
    } catch (err) {
      logError("Error listing keys:", err);
      throw err;
    }
    return results;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Checks if a key exists.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    try {
      logInfo(`SessionStorageAdapter - Checking existence of key '${key}'`);
      const fullKey = this._fullKey(key);
      return sessionStorage.getItem(fullKey) !== null;
    } catch (err) {
      logError(`Error checking key '${key}':`, err);
      return false;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Clears all stored data and metadata.
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      logInfo("SessionStorageAdapter - Clearing all data");
      await this.reset();
      sessionStorage.removeItem(this.metaKey);
      sessionStorage.removeItem(this.expireKey);
    } catch (err) {
      logError("Error clearing storage:", err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes all keys matching the current prefix.
   * @returns {Promise<void>}
   */
  async reset() {
    try {
      logInfo("SessionStorageAdapter - Resetting storage");
      const keysToRemove = [];

      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        sessionStorage.removeItem(key);
        if (this.enableSyncTabs) {
          this.emitDataChange(key.replace(this.prefix, ""), undefined, "reset");
        }
      }
    } catch (error) {
      logError("Error resetting storage:", error);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Sets an expiration timestamp for a key.
   * @param {string} key
   * @param {number} timestamp - Expiration time (epoch ms).
   * @returns {Promise<void>}
   */
  async setExpire(key, timestamp) {
    try {
      logInfo(`SessionStorageAdapter - Setting expire for key '${key}'`);
      const expires = this._loadExpires();
      expires[key] = timestamp;
      sessionStorage.setItem(this.expireKey, JSON.stringify(expires));
    } catch (err) {
      logError(`Error setting expire for key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes expiration data for a given key.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async deleteExpire(key) {
    try {
      logInfo(`SessionStorageAdapter - Deleting expire for key '${key}'`);
      const expires = this._loadExpires();
      delete expires[key];
      sessionStorage.setItem(this.expireKey, JSON.stringify(expires));
    } catch (err) {
      logError(`Error deleting expire for key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Clears all expired keys based on their timestamps.
   * @returns {Promise<void>}
   */
  async clearExpire() {
    try {
      logInfo("SessionStorageAdapter - Clearing expired keys");
      const now = Date.now();
      const expires = this._loadExpires();
      let changed = false;

      for (const key in expires) {
        if (expires[key] <= now) {
          await this.delete(key);
          changed = true;
        }
      }

      if (changed) {
        sessionStorage.setItem(
          this.expireKey,
          JSON.stringify(this._loadExpires())
        );
      }
    } catch (err) {
      logError("Error clearing expired keys:", err);
    }
  }
}

// ----------------------------------------------------------------------------------------------

export default SessionStorageAdapter;

// ----------------------------------------------------------------------------------------------
