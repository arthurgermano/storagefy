/**
 * IndexedDBAdapter is a storage adapter that utilizes the browser's IndexedDB to persist key-value data.
 * Supports optional encryption and expiration features, and handles initialization, reads, writes,
 * and periodic expiration cleanup.
 *
 * @module IndexedDBAdapter
 * @example
 * // Basic usage:
 * const adapter = new IndexedDBAdapter({
 *   dbName: 'myDatabase',
 *   storeName: 'myStore',
 *   encrypt: true,
 * });
 * await adapter.set('key', 'value', 3600000); // Expires in 1 hour
 * const value = await adapter.get('key');
 */

import StorageAdapter from "./StorageAdapter.js";
import sleep from "misc-helpers/src/utils/sleep.js";
import generateSimpleId from "misc-helpers/src/utils/generateSimpleId.js";
import { logError, logWarn, logInfo } from "../helpers/loggerHelper.js";
import { simpleDeobfuscate } from "../helpers/cryptoHelper.js";

// -------------------------------------------------------------------------------------------------

/**
 * Class representing an IndexedDB storage adapter.
 * @class IndexedDBAdapter
 * @extends StorageAdapter
 */
class IndexedDBAdapter extends StorageAdapter {
  /**
   * Creates an instance of IndexedDBAdapter.
   * @param {Object} config Configuration object
   * @param {string} config.dbName Name of the IndexedDB database
   * @param {string} [config.storeName] Name of the object store (defaults to `${dbName}_store`)
   * @param {number} [config.version=1] Database version
   * @param {boolean} [config.encrypt=false] Whether to encrypt stored data
   * @param {number} [config.expireCheckInterval=1000] Interval for expiration checks in ms
   * @param {string} [config.description=""] Description of the database
   * @param {string} [config.channelName=false] - Optional channel name for cross-tab communication.
   * @param {boolean} [config.enableSyncTabs=false] - Whether to enable sync automatically on change key value
   * @throws {Error} Throws if IndexedDB is not available in the environment
   */
  constructor({
    dbName,
    storeName,
    version = 1,
    encrypt = false,
    expireCheckInterval = 1000,
    channelName = false,
    enableSyncTabs = false,
    description = "",
  }) {
    super(channelName);
    if (typeof indexedDB === "undefined") {
      logError("IndexedDB is not available in this environment");
      throw new Error("IndexedDB is not available in this environment");
    }

    this.isReady = false;
    this.dbName = dbName;
    this.storeName = storeName || `${dbName}_store`;
    this.encrypt = encrypt;
    this.expireKey = `STRGF_${dbName}__expires`;
    this.metaKey = `STRGF_${dbName}__meta`;
    this.prefix = `${dbName}__`;
    this.adapterId = generateSimpleId(dbName);
    this.enableSyncTabs = enableSyncTabs || false;
    this.expireCheckInterval = expireCheckInterval;
    this.dbPromise = null;
    this._initDB({ dbName, version, description });
    this._startExpireWatcher();

    this._unloadHandler = () => this.destroy();
    window.addEventListener("beforeunload", this._unloadHandler);

    logInfo(
      `IndexedDBAdapter - initialized with dbName: ${dbName}, storeName: ${this.storeName}`
    );
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Initializes the IndexedDB database.
   * @private
   * @param {Object} params Initialization parameters
   * @param {string} params.dbName Database name
   * @param {number} params.version Database version
   * @param {string} params.description Database description
   * @returns {Promise} Resolves with the database instance when ready
   */
  _initDB({ dbName, version, description }) {
    logInfo(
      `IndexedDBAdapter -Initializing IndexedDB with dbName: ${dbName}, storeName: ${this.storeName}`
    );
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }

        // Store metadata
        const meta = {
          dbName,
          version,
          description,
          createdAt: Date.now(),
        };
        const transaction = event.target.transaction;
        const store = transaction.objectStore(this.storeName);
        store.put(JSON.stringify(meta), this.metaKey);
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        // Check if metadata exists, if not create it
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const metaRequest = store.get(this.metaKey);
        metaRequest.onsuccess = () => {
          if (!metaRequest.result) {
            const meta = {
              dbName,
              version,
              description,
              createdAt: Date.now(),
            };
            store.put(JSON.stringify(meta), this.metaKey);
          }
          this.isReady = true;
          resolve(db);
        };
        metaRequest.onerror = (err) => {
          logError("Error checking meta:", err);
          resolve(db); // Still resolve with db even if meta check failed
        };
      };

      request.onerror = (event) => {
        logError("Error opening database:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Waits for the database to be ready.
   * @async
   * @param {number} [timeout=15] Delay between readiness checks in ms
   * @param {number} [tries=20] Maximum number of readiness checks
   * @returns {Promise<void>} Resolves when database is ready
   * @throws {Error} Throws if database doesn't become ready within the specified attempts
   */
  async waitReadiness(timeout = 50, tries = 20) {
    logInfo(
      `IndexedDBAdapter - Waiting for database readiness with timeout: ${timeout}ms, tries: ${tries}`
    );
    return new Promise(async (resolve, reject) => {
      try {
        await sleep(timeout);
        if (this.isReady) {
          resolve();
          return true;
        }

        let attempt = 0;
        while (!this.isReady && attempt++ < tries) {
          setTimeout(() => {
            if (this.isReady) {
              resolve();
              return true;
            }
          }, timeout);
        }
      } catch (error) {
        return reject(error);
      }

      reject(new Error("Database is not ready"));
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Helper method to execute operations within a store transaction.
   * @private
   * @async
   * @param {string} mode Transaction mode ('readonly' or 'readwrite')
   * @param {Function} callback Operation to execute with the store
   * @returns {Promise} Resolves with the callback result
   * @throws {Error} Throws if the operation fails
   */
  async _withStore(mode, callback) {
    try {
      logInfo(`IndexedDBAdapter - Executing operation in ${mode} mode`);
      const db = await this.dbPromise;
      const transaction = db.transaction(this.storeName, mode);
      const store = transaction.objectStore(this.storeName);
      return await callback(store);
    } catch (err) {
      logError("Database operation failed:", err);
      throw err;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Loads all expiration timestamps.
   * @private
   * @async
   * @returns {Promise<Object>} Object mapping keys to expiration timestamps
   */
  async _loadExpires() {
    logInfo("IndexedDBAdapter - Loading expiration timestamps");
    return this._withStore("readonly", async (store) => {
      return new Promise((resolve) => {
        const request = store.get(this.expireKey);
        request.onsuccess = () => {
          resolve(request.result ? JSON.parse(request.result) : {});
        };
        request.onerror = () => {
          resolve({});
        };
      });
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieves a value from storage by key.
   * @async
   * @param {string} key Key to retrieve
   * @returns {Promise<*>} The stored value, or null if not found or expired
   * @example
   * const value = await adapter.get('myKey');
   */
  async get(key) {
    try {
      logInfo(`IndexedDBAdapter - Getting key: ${key}`);
      const fullKey = this._fullKey(key);
      const raw = await this._withStore("readonly", (store) => {
        return new Promise((resolve) => {
          const request = store.get(fullKey);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
        });
      });

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
   * Stores a value in storage with optional expiration.
   * @async
   * @param {string} key Key to store under
   * @param {*} value Value to store (will be JSON stringified)
   * @param {number} [expire] Expiration time in milliseconds from now
   * @returns {Promise<boolean>} True if successful, false otherwise
   * @example
   * await adapter.set('myKey', { data: 'value' }, 3600000); // Expires in 1 hour
   */
  async set(key, value, expire) {
    try {
      logInfo(`IndexedDBAdapter - Setting key: ${key}`, { value, expire });
      if (!key && !value) {
        return false;
      }
      const fullKey = this._fullKey(key);
      if (key && (value === undefined || value === null)) {
        await this.delete(fullKey);
        return null;
      }
      value = JSON.stringify(value);

      const encrypted = await this._encrypt(key, value);
      if (!encrypted) return false;

      await this._withStore("readwrite", (store) => {
        return new Promise((resolve) => {
          const request = store.put(encrypted, fullKey);
          request.onsuccess = () => {
            if (this.enableSyncTabs) {
              this.emitDataChange(key, undefined, "reset");
            }
            resolve(true);
          };
          request.onerror = () => resolve(false);
        });
      });

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
   * Deletes a key from storage.
   * @async
   * @param {string} key Key to delete
   * @returns {Promise<void>}
   * @example
   * await adapter.delete('myKey');
   */
  async delete(key) {
    try {
      logInfo(`IndexedDBAdapter - Deleting key: ${key}`);
      const fullKey = this._fullKey(key);
      await this._withStore("readwrite", (store) => {
        return new Promise((resolve) => {
          const request = store.delete(fullKey);
          request.onsuccess = () => {
            if (this.enableSyncTabs) {
              this.emitDataChange(key, undefined, "reset");
            }
            resolve(true);
          };
          request.onerror = () => resolve();
        });
      });

      const exp = await this._loadExpires();
      delete exp[key];
      await this._withStore("readwrite", (store) => {
        return new Promise((resolve) => {
          const request = store.put(JSON.stringify(exp), this.expireKey);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        });
      });
    } catch (err) {
      logError(`Error deleting key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Lists all keys with a given prefix and their values.
   * @async
   * @returns {Promise<Array<{key: string, value: *}>>} Array of key-value pairs
   * @example
   * const items = await adapter.list('user_');
   */
  async list() {
    const results = [];
    try {
      logInfo(`IndexedDBAdapter - Listing keys with prefix: ${this.prefix}`);
      await this._withStore("readonly", async (store) => {
        return new Promise((resolve) => {
          const request = store.getAllKeys();
          request.onsuccess = async () => {
            const keys = request.result || [];
            for (let k of keys) {
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
            resolve();
          };
          request.onerror = () => resolve();
        });
      });
    } catch (err) {
      logError("Error listing keys:", err);
    }
    return results;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Checks if a key exists in storage.
   * @async
   * @param {string} key Key to check
   * @returns {Promise<boolean>} True if key exists, false otherwise
   * @example
   * const exists = await adapter.has('myKey');
   */
  async has(key) {
    try {
      logInfo(`IndexedDBAdapter - Checking existence of key: ${key}`);
      const fullKey = this._fullKey(key);
      return await this._withStore("readonly", (store) => {
        return new Promise((resolve) => {
          const request = store.getKey(fullKey);
          request.onsuccess = () => resolve(request.result !== undefined);
          request.onerror = () => resolve(false);
        });
      });
    } catch (err) {
      logError(`Error checking key '${key}':`, err);
      return false;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Clears all data from storage including metadata.
   * @async
   * @returns {Promise<void>}
   * @example
   * await adapter.clear();
   */
  async clear() {
    try {
      logInfo("IndexedDBAdapter - Clearing all data");
      await this.reset();
      await this._withStore("readwrite", (store) => {
        return new Promise((resolve) => {
          const request = store.delete(this.metaKey);
          request.onsuccess = () => {
            const request2 = store.delete(this.expireKey);
            request2.onsuccess = () => resolve();
            request2.onerror = () => resolve();
          };
          request.onerror = () => resolve();
        });
      });
    } catch (err) {
      logError("Error clearing storage:", err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Resets storage by removing all keys with the adapter's prefix.
   * @async
   * @returns {Promise<void>}
   * @example
   * await adapter.reset();
   */
  async reset() {
    try {
      logInfo("IndexedDBAdapter - Resetting storage");
      await this._withStore("readwrite", async (store) => {
        return new Promise((resolve) => {
          const request = store.getAllKeys();
          request.onsuccess = () => {
            const keys = request.result || [];

            if (keys.length === 0) {
              resolve();
              return;
            }

            let completed = 0;
            const checkCompletion = (key) => {
              return () => {
                if (++completed === keys.length) {
                  if (this.enableSyncTabs) {
                    this.emitDataChange(key.replace(this.prefix, ""), "reset");
                  }
                  resolve();
                }
              };
            };

            for (const key of keys) {
              const deleteRequest = store.delete(key);
              deleteRequest.onsuccess = checkCompletion(key);
              deleteRequest.onerror = checkCompletion(key);
            }
          };
          request.onerror = () => resolve();
        });
      });
    } catch (error) {
      logError("Error resetting storage:", error);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Sets expiration timestamp for a key.
   * @async
   * @param {string} key Key to set expiration for
   * @param {number} timestamp Expiration timestamp in milliseconds
   * @returns {Promise<void>}
   * @example
   * await adapter.setExpire('myKey', Date.now() + 3600000); // Expire in 1 hour
   */
  async setExpire(key, timestamp) {
    try {
      logInfo(
        `IndexedDBAdapter - Setting expire for key: ${key}, timestamp: ${timestamp}`
      );
      const expires = await this._loadExpires();
      expires[key] = timestamp;
      await this._withStore("readwrite", (store) => {
        return new Promise((resolve) => {
          const request = store.put(JSON.stringify(expires), this.expireKey);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        });
      });
    } catch (err) {
      logError(`Error setting expire for key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes expiration for a key.
   * @async
   * @param {string} key Key to remove expiration from
   * @returns {Promise<void>}
   * @example
   * await adapter.deleteExpire('myKey');
   */
  async deleteExpire(key) {
    try {
      logInfo(`IndexedDBAdapter - Deleting expire for key: ${key}`);
      const expires = await this._loadExpires();
      delete expires[key];
      await this._withStore("readwrite", (store) => {
        return new Promise((resolve) => {
          const request = store.put(JSON.stringify(expires), this.expireKey);
          request.onsuccess = () => resolve();
          request.onerror = () => resolve();
        });
      });
    } catch (err) {
      logError(`Error deleting expire for key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Clears all expired keys from storage.
   * @async
   * @returns {Promise<void>}
   * @example
   * await adapter.clearExpire();
   */
  async clearExpire() {
    try {
      logInfo("IndexedDBAdapter - Clearing expired keys");
      const now = Date.now();
      const expires = await this._loadExpires();
      let changed = false;

      for (const key in expires) {
        if (expires[key] <= now) {
          await this.delete(key);
          changed = true;
        }
      }

      if (changed) {
        const currentExpires = await this._loadExpires();
        await this._withStore("readwrite", (store) => {
          return new Promise((resolve) => {
            const request = store.put(
              JSON.stringify(currentExpires),
              this.expireKey
            );
            request.onsuccess = () => resolve();
            request.onerror = () => resolve();
          });
        });
      }
    } catch (err) {
      logError("Error clearing expired keys:", err);
    }
  }
}

// ----------------------------------------------------------------------------------------------

export default IndexedDBAdapter;

// ----------------------------------------------------------------------------------------------
