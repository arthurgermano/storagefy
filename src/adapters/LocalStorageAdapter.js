import StorageAdapter from "./StorageAdapter.js";
import generateSimpleId from "misc-helpers/src/utils/generateSimpleId.js";
import { logError, logWarn, logInfo } from "../helpers/loggerHelper.js";
import { simpleDeobfuscate } from "../helpers/cryptoHelper.js";

// -------------------------------------------------------------------------------------------------

/**
 * A storage adapter for `localStorage` that supports encryption, expirations, and metadata.
 * Extends the base `StorageAdapter` class.
 */
class LocalStorageAdapter extends StorageAdapter {
  /**
   * @param {Object} options
   * @param {string} options.dbName - The database namespace.
   * @param {number} [options.version=1] - The version of the storage schema.
   * @param {boolean} [options.encrypt=false] - Whether to encrypt stored values.
   * @param {number} [options.expireCheckInterval=1000] - Interval for expiration checks.
   * @param {string} [options.description=""] - Description of the storage instance.
   * @param {string} [options.channelName=false] - Optional channel name for cross-tab communication.
   * @param {boolean} [options.enableSyncTabs=false] - Whether to enable sync automatically on change key value
   * @throws {Error} If `localStorage` is not available.
   */
  constructor({
    dbName,
    version = 1,
    encrypt = false,
    expireCheckInterval = 1000,
    description = "",
    channelName = false,
    enableSyncTabs = false,
  }) {
    super(channelName);
    if (typeof localStorage === "undefined") {
      logError("LocalStorage is not available in this environment");
      throw new Error("LocalStorage is not available in this environment");
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
      `LocalStorageAdapter -  initialized with dbName: ${dbName}, version: ${version}, encrypt: ${encrypt}, description: ${description}`
    );
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Initializes metadata for the storage namespace.
   * @private
   * @param {Object} param0
   * @param {string} param0.dbName
   * @param {number} param0.version
   * @param {string} param0.description
   */
  _initMeta({ dbName, version, description }) {
    try {
      logInfo(
        "LocalStorageAdapter - Initializing metadata for LocalStorageAdapter"
      );
      const meta = {
        dbName,
        version,
        description,
        createdAt: Date.now(),
      };
      localStorage.setItem(this.metaKey, JSON.stringify(meta));
    } catch (err) {
      logError("Error initializing meta:", err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Loads expiration metadata from storage.
   * @private
   * @returns {Object} Key-value map of expiration timestamps.
   */
  _loadExpires() {
    try {
      logInfo("LocalStorageAdapter - Loading expiration metadata");
      const raw = localStorage.getItem(this.expireKey);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      logError("Error loading expires:", err);
      return {};
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieves a stored item.
   * @param {string} key
   * @returns {Promise<any|null>} The stored value, or `null` if not found or expired.
   */
  async get(key) {
    try {
      logInfo(`LocalStorageAdapter - Getting key: ${key}`);
      const fullKey = this._fullKey(key);
      const raw = localStorage.getItem(fullKey);
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
   * Stores a value.
   * @param {string} key
   * @param {any} value
   * @param {number} [expire] - Optional expiration in milliseconds from now.
   * @returns {Promise<boolean|null>}
   */
  async set(key, value, expire) {
    try {
      logInfo(`LocalStorageAdapter - Setting key: ${key}`, { value, expire });
      if (!key && !value) return false;
      const fullKey = this._fullKey(key);
      if (key && (value === undefined || value === null)) {
        await this.delete(fullKey);
        return null;
      }
      value = JSON.stringify(value);

      const encrypted = await this._encrypt(key, value);
      if (!encrypted) return false;
      localStorage.setItem(fullKey, encrypted);

      if (this.enableSyncTabs) {
        this.emitDataChange(key, undefined, "set");
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
   * Deletes a value and its expiration.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async delete(key) {
    try {
      logInfo(`LocalStorageAdapter - Deleting key: ${key}`);
      const fullKey = this._fullKey(key);
      localStorage.removeItem(fullKey);

      const exp = this._loadExpires();
      delete exp[key];
      localStorage.setItem(this.expireKey, JSON.stringify(exp));
      if (this.enableSyncTabs) {
        this.emitDataChange(key, undefined, "delete");
      }
    } catch (err) {
      logError(`Error deleting key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Lists all keys and their values for the current prefix.
   * @returns {Promise<Array<{ key: string, value: any }>>}
   */
  async list() {
    const results = [];
    logInfo(`LocalStorageAdapter - Listing keys with prefix: ${this.prefix}`);
    try {
      for (let i = 0; i < localStorage.length; i++) {
        let k = localStorage.key(i);
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
   * Checks whether a key exists.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    try {
      logInfo(`LocalStorageAdapter - Checking existence of key: ${key}`);
      const fullKey = this._fullKey(key);
      return localStorage.getItem(fullKey) !== null;
    } catch (err) {
      logError(`Error checking key '${key}':`, err);
      return false;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Clears all data, metadata, and expiration info.
   * @returns {Promise<void>}
   */
  async clear() {
    try {
      logInfo("LocalStorageAdapter - Clearing all data");
      await this.reset();
      localStorage.removeItem(this.metaKey);
      localStorage.removeItem(this.expireKey);
    } catch (err) {
      logError("Error clearing storage:", err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes all keys related to the current storage instance.
   * @returns {Promise<void>}
   */
  async reset() {
    try {
      logInfo("LocalStorageAdapter - Resetting storage");
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        localStorage.removeItem(key);
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
   * @param {number} timestamp - Unix timestamp in milliseconds.
   * @returns {Promise<void>}
   */
  async setExpire(key, timestamp) {
    try {
      logInfo(`LocalStorageAdapter - Setting expiration for key: ${key}`, {
        timestamp,
      });
      const expires = this._loadExpires();
      expires[key] = timestamp;
      localStorage.setItem(this.expireKey, JSON.stringify(expires));
    } catch (err) {
      logError(`Error setting expire for key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes the expiration timestamp for a key.
   * @param {string} key
   * @returns {Promise<void>}
   */
  async deleteExpire(key) {
    try {
      logInfo(`LocalStorageAdapter - Deleting expiration for key: ${key}`);
      const expires = this._loadExpires();
      delete expires[key];
      localStorage.setItem(this.expireKey, JSON.stringify(expires));
    } catch (err) {
      logError(`Error deleting expire for key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes all expired items from storage.
   * @returns {Promise<void>}
   */
  async clearExpire() {
    try {
      logInfo("LocalStorageAdapter - Clearing expired keys");
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
        localStorage.setItem(
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

export default LocalStorageAdapter;

// ----------------------------------------------------------------------------------------------
