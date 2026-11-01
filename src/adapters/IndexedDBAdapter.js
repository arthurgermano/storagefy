/**
 * IndexedDBAdapter is a storage adapter over the browser's IndexedDB: encryption, expirations, metadata and the
 * changes told to other tabs.
 *
 * @module IndexedDBAdapter
 * @example
 * const adapter = new IndexedDBAdapter({ dbName: "my-app", encrypt: true, password: "my-app-secret" });
 * await adapter.set("theme", "dark");
 * const theme = await adapter.get("theme");
 */

import StorageAdapter from "./StorageAdapter.js";
import { generateSimpleId } from "misc-helpers";
import { logError, logInfo, logWarn } from "../helpers/loggerHelper.js";

// -------------------------------------------------------------------------------------------------

/**
 * @class IndexedDBAdapter
 * @extends StorageAdapter
 */
class IndexedDBAdapter extends StorageAdapter {
  /**
   * @param {import("./StorageAdapter.js").StorageAdapterOptions & { storeName?: string }} options - storeName: the
   *   object store (defaults to `${dbName}_store`).
   * @throws {Error} If IndexedDB is not available, or an encryption option is invalid.
   */
  constructor({
    dbName,
    storeName,
    version = 1,
    encrypt = false,
    password = null,
    keyDerivation,
    expireCheckInterval = 1000,
    channelName = false,
    enableSyncTabs = false,
    description = "",
  }) {
    // Checked before anything is opened: a missing IndexedDB leaves no channel behind
    if (typeof indexedDB === "undefined") {
      logError("IndexedDB is not available in this environment");
      throw new Error("IndexedDB is not available in this environment");
    }
    super(channelName);

    this.isReady = false;
    this.dbName = dbName;
    this.storeName = storeName || `${dbName}_store`;
    this.encrypt = encrypt;
    this._setEncryption(password, keyDerivation);
    this.expireKey = `STRGF_${dbName}__expires`;
    this.metaKey = `STRGF_${dbName}__meta`;
    this.prefix = `${dbName}__`;
    this.adapterId = generateSimpleId(dbName);
    this.enableSyncTabs = enableSyncTabs || false;
    this.expireCheckInterval = expireCheckInterval;

    this.dbPromise = this._initDB({ dbName, version, description });
    // Every use awaits it and sees the failure; this keeps a database that cannot open from also being reported
    // as an unhandled rejection
    this.dbPromise.catch(() => {});
    this._startExpireWatcher();
    logInfo(`IndexedDBAdapter - initialized with dbName: ${dbName}, storeName: ${this.storeName}`);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Opens the database (creating the object store and the metadata the first time).
   *
   * Never left waiting for good: a database without this adapter's object store is refused with the reason, and a
   * newer version opened by another tab closes this connection (see _closeDB) instead of blocking that tab.
   * @private
   * @returns {Promise<IDBDatabase>}
   * @throws {Error} If the database does not open, or has no object store of this name.
   */
  _initDB({ dbName, version, description }) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);
      const meta = () => JSON.stringify({ dbName, version, description, createdAt: Date.now() });

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };

      // Another tab still holds an older version open: the open goes on once that tab closes it
      request.onblocked = () => {
        logWarn(`IndexedDB "${dbName}" (version ${version}) waits for the other tabs to close an older version`);
      };

      request.onsuccess = () => {
        const db = request.result;
        // The object store is created only on an upgrade: an existing database of this version opened with another
        // storeName (startStoragefy and the class have different defaults) has none
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.close();
          const error = new Error(
            `Storagefy: the IndexedDB database "${dbName}" (version ${db.version}) has no object store ` +
              `"${this.storeName}" — open it with the storeName it was created with, or raise version to create it`,
          );
          logError(error.message);
          reject(error);
          return;
        }
        db.onversionchange = () => {
          this._closeDB(
            db,
            new Error(`Storagefy: the IndexedDB database "${dbName}" was upgraded by another tab — reload the page`),
          );
        };
        const store = db.transaction(this.storeName, "readwrite").objectStore(this.storeName);
        const metaRequest = store.get(this.metaKey);
        const opened = () => {
          this.isReady = true;
          resolve(db);
        };
        metaRequest.onsuccess = () => {
          if (!metaRequest.result) {
            store.put(meta(), this.metaKey);
          }
          opened();
        };
        // The metadata is a record kept for the app; the database is usable without it
        metaRequest.onerror = () => {
          logError("Error checking meta:", metaRequest.error);
          opened();
        };
      };

      request.onerror = () => {
        logError("Error opening database:", request.error);
        reject(request.error);
      };
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Closes the connection for good: every use after it fails with the reason (a write answers false, a read null,
   * both through onError).
   * @private
   * @param {IDBDatabase} db
   * @param {Error} reason - Why it closed.
   */
  _closeDB(db, reason) {
    db.close();
    this.isReady = false;
    this.dbPromise = Promise.reject(reason);
    this.dbPromise.catch(() => {});
    logWarn(reason.message);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Releases the adapter (see StorageAdapter.destroy) and closes the database connection.
   * @returns {Promise<void>}
   */
  async destroy() {
    await super.destroy();
    const db = await this.dbPromise.catch(() => null);
    if (db) {
      this._closeDB(db, new Error(`Storagefy: the IndexedDB adapter of "${this.dbName}" was destroyed`));
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Waits until the database is open.
   * @param {number} [interval=50] - With tries: how long to wait, interval × (tries + 1) ms.
   * @param {number} [tries=20]
   * @returns {Promise<void>}
   * @throws {Error} Why the database is not open (it was refused, upgraded by another tab, destroyed), or "Database is
   *   not ready" when it is not open in time.
   */
  async waitReadiness(interval = 50, tries = 20) {
    let timer;
    const gaveUp = new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("Database is not ready")), interval * (tries + 1));
    });
    try {
      await Promise.race([this.dbPromise, gaveUp]);
    } finally {
      clearTimeout(timer);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Runs requests in one transaction of the object store and answers once the transaction is over — for a write,
   * once it is really saved: a request that succeeds may still be undone when the transaction aborts (e.g. the
   * storage is full).
   *
   * The callback must issue every request before it awaits anything else: a transaction closes when no request is
   * pending.
   * @private
   * @template T
   * @param {IDBTransactionMode} mode
   * @param {(store: IDBObjectStore) => Promise<T>} callback - Issues the requests; resolves with the answer.
   * @returns {Promise<T>}
   * @throws {Error} If the database does not open, a request fails or the transaction aborts.
   */
  async _withStore(mode, callback) {
    const db = await this.dbPromise;
    const transaction = db.transaction(this.storeName, mode);
    const finished = new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
    let result;
    try {
      result = await callback(transaction.objectStore(this.storeName));
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // Already over (aborted by the failed request itself)
      }
      await finished.catch(() => {});
      throw error;
    }
    await finished;
    return result;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The answer of a request, as a promise.
   * @private
   * @param {IDBRequest} request
   * @returns {Promise<any>}
   */
  _answerOf(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The expiration timestamps as stored.
   * @private
   * @param {string|undefined} raw
   * @returns {Object<string, number>}
   */
  _expiresOf(raw) {
    return raw ? JSON.parse(raw) : {};
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Loads all expiration timestamps.
   * @private
   * @returns {Promise<Object<string, number>>}
   */
  async _loadExpires() {
    return this._withStore("readonly", async (store) => this._expiresOf(await this._answerOf(store.get(this.expireKey))));
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Changes the expirations in the same transaction as the request that needs it — never read in one transaction
   * and written in another, where two writes at once would lose one of the changes.
   * @private
   * @param {IDBObjectStore} store - The store of the running transaction.
   * @param {(expires: Object<string, number>) => boolean} change - Changes the map; true when something changed.
   * @returns {Promise<void>}
   */
  async _changeExpires(store, change) {
    const expires = this._expiresOf(await this._answerOf(store.get(this.expireKey)));
    if (change(expires)) {
      await this._answerOf(store.put(JSON.stringify(expires), this.expireKey));
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieves a value from storage by key — after the writes of the key asked before.
   * @param {string} key - Key to retrieve
   * @param {import("./StorageAdapter.js").ReadOptions} [options]
   * @returns {Promise<any>} The stored value, or null if absent, expired or unreadable.
   */
  async get(key, options = {}) {
    await this._afterWrites(key);
    try {
      const fullKey = this._fullKey(key);
      const { raw, expires } = await this._withStore("readonly", async (store) => {
        const [value, expiresRaw] = await Promise.all([
          this._answerOf(store.get(fullKey)),
          this._answerOf(store.get(this.expireKey)),
        ]);
        return { raw: value, expires: this._expiresOf(expiresRaw)[key] };
      });
      if (!raw) return null;
      if (this._isExpired(expires)) {
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
   * Stores a value — the value and its expiration in one transaction. Writes of a key are applied in the order they
   * were called.
   * @param {string} key - Key to store under
   * @param {any} value - JSON; null or undefined removes the key.
   * @param {number} [expire] - Expiration in milliseconds from now; 0 or less removes the key.
   * @returns {Promise<boolean|null>} true when saved, false when it failed, null when the key was removed.
   */
  async set(key, value, expire) {
    return this._inOrder(key, async () => {
      try {
        if (!key && !value) return false;
        if (value === undefined || value === null || (typeof expire === "number" && expire <= 0)) {
          await this._deleteNow(key);
          return null;
        }
        // Encrypted before the transaction opens: it would close while waiting for the encryption
        const stored = await this._encrypt(key, JSON.stringify(value));
        if (stored === null) return false;
        const expiresAt = typeof expire === "number" ? Date.now() + expire : null;

        // Awaited together: when one request fails, the other's failure (the transaction aborts) has a handler too
        await this._withStore("readwrite", (store) =>
          Promise.all([
            this._answerOf(store.put(stored, this._fullKey(key))),
            this._changeExpires(store, (expires) => {
              if (expiresAt !== null) {
                expires[key] = expiresAt;
                return true;
              }
              return this._removeExpire(expires, key);
            }),
          ]),
        );
        if (this.enableSyncTabs) {
          this.emitDataChange(key, undefined, "set");
        }
        return true;
      } catch (err) {
        logError(`Error setting key '${key}':`, err);
        return false;
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes a key and its expiration in one transaction, and tells the other tabs.
   * @private
   * @param {string} key
   * @returns {Promise<void>}
   * @throws {Error} If the transaction fails.
   */
  async _deleteNow(key) {
    await this._withStore("readwrite", (store) =>
      Promise.all([
        this._answerOf(store.delete(this._fullKey(key))),
        this._changeExpires(store, (expires) => this._removeExpire(expires, key)),
      ]),
    );
    if (this.enableSyncTabs) {
      this.emitDataChange(key, undefined, "delete");
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes a key found expired, if it still is when its turn in the queue comes (see StorageAdapter._expire) — the
   * check and the removal in one transaction, so a write of another tab cannot land between them.
   * @protected
   * @param {string} key
   * @returns {Promise<void>}
   */
  async _expire(key) {
    return this._inOrder(key, async () => {
      try {
        const removed = await this._withStore("readwrite", async (store) => {
          const expires = this._expiresOf(await this._answerOf(store.get(this.expireKey)));
          if (!this._isExpired(expires[key])) {
            return false;
          }
          delete expires[key];
          await Promise.all([
            this._answerOf(store.delete(this._fullKey(key))),
            this._answerOf(store.put(JSON.stringify(expires), this.expireKey)),
          ]);
          return true;
        });
        if (removed && this.enableSyncTabs) {
          this.emitDataChange(key, undefined, "delete");
        }
      } catch (err) {
        logError(`Error expiring key '${key}':`, err);
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Deletes a key — after the writes of the key asked before.
   * @param {string} key - Key to delete
   * @returns {Promise<void>}
   */
  async delete(key) {
    return this._inOrder(key, async () => {
      try {
        await this._deleteNow(key);
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
    const results = [];
    try {
      const storedKeys = await this._withStore("readonly", (store) => this._answerOf(store.getAllKeys()));
      for (const stored of storedKeys) {
        const key = this._ownKey(stored, prefix);
        if (key === null) continue;
        const value = await this.get(key);
        if (value !== null) {
          results.push({ key, value });
        }
      }
    } catch (err) {
      logError("Error listing keys:", err);
    }
    return results;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Checks whether a key is stored and not expired (an expired key is left for get or the watcher to remove) — the
   * key and the expirations read in one transaction, after the writes of the key asked before.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async has(key) {
    await this._afterWrites(key);
    try {
      const fullKey = this._fullKey(key);
      const { found, expires } = await this._withStore("readonly", async (store) => {
        const [storedKey, expiresRaw] = await Promise.all([
          this._answerOf(store.getKey(fullKey)),
          this._answerOf(store.get(this.expireKey)),
        ]);
        return { found: storedKey !== undefined, expires: this._expiresOf(expiresRaw)[key] };
      });
      return found && !this._isExpired(expires);
    } catch (err) {
      logError(`Error checking key '${key}':`, err);
      return false;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Clears every key of the namespace, its metadata and its expirations — in one transaction, after the writes asked
   * before (see StorageAdapter._exclusive).
   * @returns {Promise<void>}
   */
  async clear() {
    return this._exclusive(() => this._resetNow(true));
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every key of the namespace and their expirations (the metadata stays), and tells the other tabs — in one
   * transaction, after the writes asked before (see StorageAdapter._exclusive).
   * @returns {Promise<void>}
   */
  async reset() {
    return this._exclusive(() => this._resetNow(false));
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every key of the namespace and the expirations record (and the metadata, when asked), now.
   * @private
   * @param {boolean} withMeta - Remove the metadata too (clear).
   * @returns {Promise<void>}
   */
  async _resetNow(withMeta) {
    try {
      const removed = await this._withStore("readwrite", async (store) => {
        const keys = [];
        for (const stored of await this._answerOf(store.getAllKeys())) {
          const key = this._ownKey(stored);
          if (key !== null) {
            keys.push(key);
            store.delete(stored);
          }
        }
        // The expirations record holds only keys of the namespace: none is left
        store.delete(this.expireKey);
        if (withMeta) {
          store.delete(this.metaKey);
        }
        return keys;
      });
      if (this.enableSyncTabs) {
        for (const key of removed) {
          this.emitDataChange(key, undefined, "reset");
        }
      }
    } catch (error) {
      logError(withMeta ? "Error clearing storage:" : "Error resetting storage:", error);
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
      await this._withStore("readwrite", (store) =>
        this._changeExpires(store, (expires) => {
          expires[key] = timestamp;
          return true;
        }),
      );
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
      await this._withStore("readwrite", (store) => this._changeExpires(store, (expires) => this._removeExpire(expires, key)));
    } catch (err) {
      logError(`Error deleting expire for key '${key}':`, err);
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes the expiration of a key from the map.
   * @private
   * @param {Object<string, number>} expires
   * @param {string} key
   * @returns {boolean} Whether the key had one.
   */
  _removeExpire(expires, key) {
    if (!(key in expires)) {
      return false;
    }
    delete expires[key];
    return true;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every expired key.
   * @returns {Promise<void>}
   */
  async clearExpire() {
    try {
      const expires = await this._loadExpires();
      for (const key of Object.keys(expires)) {
        if (this._isExpired(expires[key])) {
          await this._expire(key);
        }
      }
    } catch (err) {
      logError("Error clearing expired keys:", err);
    }
  }
}

// ----------------------------------------------------------------------------------------------

export default IndexedDBAdapter;

// ----------------------------------------------------------------------------------------------
