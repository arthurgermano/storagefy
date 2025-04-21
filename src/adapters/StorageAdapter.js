import * as cryptoHelper from "../helpers/cryptoHelper.js";
import CrossTabChannel from "../helpers/CrossTabChannel.js";
import { logInfo, logWarn, logError } from "../helpers/loggerHelper.js";

// -------------------------------------------------------------------------------------------------

/**
 * @class StorageAdapter
 * @abstract
 * Base class for implementing storage adapters with optional encryption and expiration.
 *
 * Subclasses must implement core storage methods such as `get`, `set`, `delete`, etc.
 * This class optionally sets up a cross-tab communication channel for broadcasting and
 * receiving data changes across browser tabs or contexts.
 */
class StorageAdapter {
  /**
   * Constructs a new StorageAdapter instance.
   *
   * @param {string} [channelName] - Optional name of the communication channel to enable cross-tab syncing.
   *                                 If provided, a CrossTabChannel is initialized for emitting and receiving changes.
   */
  constructor(channelName) {
    // If a channel name is provided, initialize the cross-tab channel.
    if (channelName) {
      logInfo("StorageAdapter - Initializing cross-tab channel:", channelName);
      this.channelName = channelName;
      this.channel = new CrossTabChannel(channelName);
    } else {
      // If no channel name is provided, disable cross-tab syncing.
      this.channel = null;
      this.channelName = null;
      logWarn(
        "StorageAdapter - No channel name provided, cross-tab syncing disabled."
      );
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieve the value for a given key.
   * @abstract
   * @param {string} key - The storage key.
   * @returns {Promise<any>}
   * @throws Will throw if not implemented.
   */
  async get(key) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Store a value under a key.
   * @abstract
   * @param {string} key - The storage key.
   * @param {any} value - The value to store.
   * @param {number} [expire] - Optional expiration in milliseconds from now.
   * @returns {Promise<void>}
   * @throws Will throw if not implemented.
   */
  async set(key, value, expire) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Delete a specific key.
   * @abstract
   * @param {string} key - The storage key to remove.
   * @returns {Promise<void>}
   * @throws Will throw if not implemented.
   */
  async delete(key) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * List all keys with a given prefix.
   * @abstract
   * @param {string} [prefix=""] - Prefix to filter keys.
   * @returns {Promise<string[]>}
   * @throws Will throw if not implemented.
   */
  async list(prefix = "") {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Reset the entire adapter (e.g., delete all tables, indexes, etc.).
   * @abstract
   * @returns {Promise<void>}
   * @throws Will throw if not implemented.
   */
  async reset() {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Clear all stored values.
   * @abstract
   * @returns {Promise<void>}
   * @throws Will throw if not implemented.
   */
  async clear() {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Remove all expired keys.
   * @abstract
   * @returns {Promise<void>}
   * @throws Will throw if not implemented.
   */
  async clearExpire() {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Set an expiration time (in ms) for a given key.
   * @abstract
   * @param {string} key - Key to expire.
   * @param {number} time - Expiration timestamp in ms.
   * @returns {Promise<void>}
   * @throws Will throw if not implemented.
   */
  async setExpire(key, time) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Remove expiration for a specific key.
   * @abstract
   * @param {string} key - Key to remove expiration from.
   * @returns {Promise<void>}
   * @throws Will throw if not implemented.
   */
  async deleteExpire(key) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Check if a key exists.
   * @abstract
   * @param {string} key - Key to check.
   * @returns {Promise<boolean>}
   * @throws Will throw if not implemented.
   */
  async has(key) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Encrypt a value
   * @protected
   * @param {any} value - Value to encrypt.
   * @returns {Promise<string|null>} - Encrypted JSON string or null on failure.
   */
  async _encrypt(key, value) {
    if (!this.encrypt || !key) return value;
    try {
      const cKey = await cryptoHelper.deriveKey(key);
      const encrypted = await cryptoHelper.encryptData(cKey, value, false);
      logInfo(
        `StorageAdapter - Successfully encrypted value for key "${key}".`
      );
      return JSON.stringify(encrypted);
    } catch (err) {
      logError("Encryption failed:", err);
      return null;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Decrypt a previously encrypted value.
   * @protected
   * @param {string} value - Encrypted stringified data.
   * @returns {Promise<any|null>} - Decrypted object or null on failure.
   */
  async _decrypt(key, value) {
    if (!this.encrypt || !key) return JSON.parse(value);
    try {
      const cKey = await cryptoHelper.deriveKey(key);
      const encryptedObj = JSON.parse(value);
      const decrypted = await cryptoHelper.decryptData(
        cKey,
        encryptedObj,
        false
      );
      logInfo(
        `StorageAdapter - Successfully decrypted value for key "${key}".`
      );
      return JSON.parse(decrypted);
    } catch (err) {
      logError("Decryption failed:", err);
      return null;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Generate the full namespaced key.
   * @protected
   * @param {string} key - The base key.
   * @returns {string} - The namespaced key.
   */
  _fullKey(key) {
    const full = `${this.prefix}${key}`;
    if (this.encrypt) {
      const obfuscated = cryptoHelper.simpleObfuscate(full);
      logInfo(`StorageAdapter - Obfuscated key "${key}" to "${obfuscated}".`);
      return obfuscated;
    }
    logInfo(`StorageAdapter - Using plain key: "${full}"`);
    return full;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Starts the expiration watcher to periodically clear expired keys.
   * @protected
   */
  _startExpireWatcher() {
    if (this._expireTimer) clearInterval(this._expireTimer);
    if (this.expireCheckInterval <= 0) {
      return;
    }
    this._expireTimer = setInterval(() => {
      try {
        logInfo("StorageAdapter - Running expiration cleanup...");
        this.clearExpire();
      } catch (err) {
        logError("Error clearing expired keys:", err);
      }
    }, this.expireCheckInterval);
    logInfo(
      `StorageAdapter - Expire watcher started, interval: ${this.expireCheckInterval}ms`
    );
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Cleans up timers and listeners.
   */
  destroy() {
    if (this._expireTimer) {
      clearInterval(this._expireTimer);
      this._expireTimer = null;
      logInfo("StorageAdapter - Expire watcher stopped.");
    }

    if (this._unloadHandler) {
      window.removeEventListener("beforeunload", this._unloadHandler);
      this._unloadHandler = null;
      logInfo("StorageAdapter - Removed unload handler.");
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * List all keys under a specific table prefix.
   * @param {string} tableName - Table prefix.
   * @returns {Promise<string[]>} - List of keys.
   */
  async getAll(tableName) {
    logInfo(`StorageAdapter - Getting all keys under table: "${tableName}"`);
    return this.list(`${tableName}__`);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Get the expiration timestamp for a key.
   * @param {string} key - Key to check.
   * @returns {Promise<number|null>} - Expiration timestamp or null.
   */
  async getExpire(key) {
    try {
      const expires = await this._loadExpires();
      logInfo(
        `StorageAdapter - Getting expiration for key "${key}":`,
        expires[key] || null
      );
      return expires[key] || null;
    } catch (err) {
      logError(`Error getting expire for key '${key}':`, err);
      return null;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Emits a data change event through the communication channel,
   * typically used to notify other tabs, windows, or contexts that
   * a value has been updated.
   *
   * @param {string} key - The key of the updated data.
   * @param {*} value - The new value associated with the key. May be encrypted depending on adapter logic.
   * @param {string} origin - A unique identifier for the source of the change (e.g., tab ID or UUID).
   */
  emitDataChange(key, value, origin) {
    // Ensure the communication channel is active and an origin is provided.
    if (!this.channelName || !origin) {
      return;
    }
    logInfo(
      `StorageAdapter - Emitting data change for key "${key}" from origin "${origin}"`
    );
    // Emit a structured message containing change metadata and the new value.
    this.channel.emit({
      adapterId: this.adapterId, // Identifies which adapter emitted the change.
      key, // The key that was changed.
      value, // The new (possibly encrypted) value.
      origin, // Identifies the origin of this change.
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Registers a callback function to be invoked when data changes
   * are emitted through the communication channel.
   *
   * This is used to keep stores or application state in sync when
   * updates happen from external sources (e.g., other tabs or devices).
   *
   * @param {Function} callback - A function to handle incoming data change events.
   *                              The callback receives an object with properties:
   *                              `{ adapterId, key, value, origin }`
   */
  onDataChanged(callback) {
    // Validate that a channel exists and the provided callback is a function.
    if (!this.channelName || typeof callback !== "function") {
      return;
    }

    // Subscribe the callback to the channel to receive emitted data changes.
    logInfo("StorageAdapter - Subscribing to cross-tab data changes.");
    this.channel.subscribe(callback);
  }
}

// ------------------------------------------------------------------------------------------------

export default StorageAdapter;

// ------------------------------------------------------------------------------------------------
