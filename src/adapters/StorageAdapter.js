import * as cryptoHelper from "../helpers/cryptoHelper.js";
import CrossTabChannel from "../helpers/CrossTabChannel.js";
import { reportFailure } from "../helpers/failureReport.js";
import { logInfo, logWarn, logError } from "../helpers/loggerHelper.js";
import { generateSimpleId } from "misc-helpers";
import { RevisionBook, isRevision } from "../helpers/revisions.js";

// -------------------------------------------------------------------------------------------------

/** @typedef {import("../helpers/revisions.js").Revision} Revision */

/**
 * Options shared by every storage adapter.
 * @typedef {Object} StorageAdapterOptions
 * @property {string} dbName - Namespace of the keys (the database name, for IndexedDB).
 * @property {number} [version=1] - Version of the stored schema.
 * @property {boolean} [encrypt=false] - Encrypt the values (AES-GCM) and obfuscate the key names. It makes reading
 *   them in the browser harder; it does not keep a secret — never store a token or a password.
 * @property {string} [password] - The app's secret the encryption keys are derived from (only with `encrypt`).
 *   Without it, a key is derived from the storage key's own name.
 * @property {"hkdf"|"pbkdf2"} [keyDerivation="hkdf"] - How a key is derived from the password: "hkdf" (fast) when the
 *   password is a constant of the app; "pbkdf2" (slow on purpose) only when the person types it. Values are read
 *   the way they were written, whatever this option is now.
 * @property {number} [expireCheckInterval=1000] - How often (ms) expired keys are removed; 0 turns the watcher off.
 * @property {string} [description=""] - Description kept with the metadata.
 * @property {string|false} [channelName=false] - Name of the BroadcastChannel the tabs of the app talk on.
 * @property {boolean} [enableSyncTabs=false] - Tell the other tabs about every write and delete (needs channelName).
 */

/**
 * Options of a read.
 * @typedef {Object} ReadOptions
 * @property {(error: Error) => void} [onError] - Called when a value is there but cannot be read (it does not
 *   decrypt, it is not JSON, the storage failed). The read still answers null.
 */

/**
 * A change told by another tab.
 * @typedef {Object} DataChange
 * @property {string} adapterId - The adapter that wrote it.
 * @property {string} dbName - The namespace of the key: a store follows only the changes of its own namespace, so apps
 *   (or parts of one) that share a channel name do not mix their states.
 * @property {string} key - The storage key.
 * @property {string} [value] - The stored value (localStorage and sessionStorage; IndexedDB is read again).
 * @property {string} origin - What happened ("set", "delete", "reset").
 * @property {Revision} [revision] - The order of the write ("set"); a message of 1.3.x has none.
 */

/**
 * What is stored under a key, with the order of its write.
 * @typedef {Object} StoredRead
 * @property {any} value - The value, or null when absent, expired or unreadable.
 * @property {Revision} [revision] - The revision of the value; none for a value written before 1.4.0, or none stored.
 */

// -------------------------------------------------------------------------------------------------

/**
 * @class StorageAdapter
 * @abstract
 * Base class of the storage adapters: encryption, the order of writes and the channel between tabs.
 */
class StorageAdapter {
  /**
   * The namespace, the encryption and the channel between tabs — the options every adapter shares.
   * @param {StorageAdapterOptions} [options]
   * @throws {Error} If an encryption option is invalid — checked before the channel opens: none is left behind.
   */
  constructor({
    dbName,
    encrypt = false,
    password = null,
    keyDerivation,
    expireCheckInterval = 1000,
    channelName = false,
    enableSyncTabs = false,
  } = {}) {
    this._setEncryption(password, keyDerivation);
    this.dbName = dbName;
    this.encrypt = encrypt;
    // The keys of the app start with the prefix; the namespace's own records are never listed (see _isRecord)
    this.prefix = `${dbName}__`;
    this.metaKey = `STRGF_${dbName}__meta`;
    this.expireKey = `STRGF_${dbName}__expires`;
    this.revisionKey = `STRGF_${dbName}__revisions`;
    this.adapterId = generateSimpleId(dbName);
    /** What this adapter knows of the revisions of the writes (see helpers/revisions.js) */
    this.revisions = new RevisionBook(this.adapterId);
    this.expireCheckInterval = expireCheckInterval;
    this.enableSyncTabs = enableSyncTabs || false;
    /** Whether the tabs of the app share the storage (IndexedDB, localStorage): a tab can read what another wrote */
    this.sharedBetweenTabs = false;
    // The AES key of each storage key and derivation, derived once (PBKDF2 is slow on purpose). Kept as the promise,
    // so concurrent reads and writes share one derivation.
    this._derivedKeys = new Map();
    // The write in progress of each key: writes of a key run one after another, in the order they were asked
    this._pendingWrites = new Map();
    // The operation on every key in progress (reset, clear): it runs after the writes asked before it, and the
    // writes asked after it wait for it
    this._barrier = Promise.resolve();
    /** @type {ReturnType<typeof setInterval> | null} The expiry watcher (the browser's and Node's timers differ) */
    this._expireTimer = null;

    if (channelName) {
      logInfo("StorageAdapter - Initializing cross-tab channel:", channelName);
      this.channelName = channelName;
      this.channel = new CrossTabChannel(channelName);
    } else {
      this.channel = null;
      this.channelName = null;
      logWarn("StorageAdapter - No channel name provided, cross-tab syncing disabled.");
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieve the value for a given key — after the writes of the key asked before.
   * @param {string} key - The storage key.
   * @param {ReadOptions} [options]
   * @returns {Promise<any>} The value, or null when absent, expired or unreadable.
   */
  async get(key, options) {
    return (await this._read(key, options)).value;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Stores a value under a key, with its expiration and revision. Writes of a key are applied in the order they were
   * called (see _inOrder).
   * @param {string} key - The storage key.
   * @param {any} value - The value to store (JSON); null or undefined removes the key.
   * @param {number} [expire] - Expiration in milliseconds from now; 0 or less removes the key.
   * @returns {Promise<boolean|null>} true when stored, false when it failed, null when the key was removed.
   */
  async set(key, value, expire) {
    return this._inOrder(key, async () => {
      try {
        if (!key && !value) return false;
        if (value === undefined || value === null || (typeof expire === "number" && expire <= 0)) {
          await this._deleteNow(key);
          return null;
        }
        // Encrypted before the write begins (an IndexedDB transaction would close while waiting for it)
        const stored = await this._encrypt(key, JSON.stringify(value));
        if (stored === null) return false;
        const expiresAt = typeof expire === "number" ? Date.now() + expire : null;
        const next = await this._writeNow(key, stored, expiresAt);
        this.revisions.wrote(key, next);
        if (this.enableSyncTabs) {
          this.emitDataChange(key, this._messageValue(stored), "set", next.revision);
        }
        return true;
      } catch (err) {
        // e.g. the storage is full (QuotaExceededError), or the transaction aborted
        logError(`Error setting key '${key}':`, err);
        return false;
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Deletes a key, its expiration and its revision — after the writes of the key asked before.
   * @param {string} key - The storage key to remove.
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
    const keys = [];
    for (const stored of await this._storedKeys()) {
      const key = this._ownKey(stored, prefix);
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
   * Removes every key of the namespace, their expirations and revisions (the metadata stays), and tells the other
   * tabs — after the writes asked before (see _exclusive).
   * @returns {Promise<void>}
   */
  async reset() {
    return this._exclusive(() => this._resetNow(false));
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every key of the namespace and its records, the metadata too — after the writes asked before (see
   * _exclusive).
   * @returns {Promise<void>}
   */
  async clear() {
    return this._exclusive(() => this._resetNow(true));
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every expired key (see _expire: each only if it still is when its turn comes).
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

  // ----------------------------------------------------------------------------------------------

  /**
   * The state a change of another tab tells, with its revision — for the store adapters (see StoreAdapter). A message
   * that carries the stored value (localStorage, sessionStorage) is decrypted; one that carries none (IndexedDB: a
   * write is told once its transaction is saved, so a read after the message sees it) is read from storage.
   * @protected
   * @param {DataChange} change
   * @param {ReadOptions} [options]
   * @returns {Promise<StoredRead & { fromStorage: boolean }>} fromStorage: read from storage, not from the message.
   * @throws {Error} If the value in the message cannot be read (it does not decrypt, it is not JSON).
   */
  async _readChange(change, options) {
    if (change.value === undefined) {
      return { ...(await this._read(change.key, options)), fromStorage: true };
    }
    return { value: await this._decrypt(change.key, change.value), revision: change.revision, fromStorage: false };
  }

  // ----------------------------------------------------------------------------------------------
  // What each adapter does with its storage
  // ----------------------------------------------------------------------------------------------

  /**
   * What is stored under a key, with its revision — after the writes of the key asked before.
   * @abstract
   * @protected
   * @param {string} key - The storage key.
   * @param {ReadOptions} [options]
   * @returns {Promise<StoredRead>} Never rejects: a value that cannot be read is null, told through onError.
   */
  async _read(key, options) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Writes a stored text now, with its expiration and its revision — the revision read and raised with the write, so
   * no write of this storage lands between (see RevisionBook.next).
   * @abstract
   * @protected
   * @param {string} key - The storage key.
   * @param {string} stored - What to store (encrypted when the adapter encrypts).
   * @param {number|null} expiresAt - When it expires (ms since the epoch); null: never.
   * @returns {Promise<import("../helpers/revisions.js").NextRevision>} The revision of the write.
   * @throws {Error} If the storage refused it.
   */
  async _writeNow(key, stored, expiresAt) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * What the message of a write carries of its value: the stored text, or nothing when the other tabs read storage
   * once told (IndexedDB).
   * @protected
   * @param {string} stored
   * @returns {string|undefined}
   */
  _messageValue(stored) {
    return undefined;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes a key, its expiration and its revision now, and tells the other tabs.
   * @abstract
   * @protected
   * @param {string} key - The storage key.
   * @returns {Promise<void>}
   * @throws {Error} If the storage failed.
   */
  async _deleteNow(key) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Every key of the storage, as stored — the app's, the namespace's records, other namespaces' (see _ownKey).
   * @abstract
   * @protected
   * @returns {Promise<string[]>}
   */
  async _storedKeys() {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes every key of the namespace and the expirations and revisions records now (the metadata too, when asked),
   * and tells the other tabs. Never rejects: a failure is logged.
   * @abstract
   * @protected
   * @param {boolean} withMeta - Remove the metadata too (clear).
   * @returns {Promise<void>}
   */
  async _resetNow(withMeta) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The expiration timestamps of the namespace, by key.
   * @abstract
   * @protected
   * @returns {Promise<Object<string, number>>|Object<string, number>} A promise with IndexedDB; the record itself with
   *   localStorage and sessionStorage.
   */
  async _loadExpires() {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Set the expiration time of a key.
   * @abstract
   * @param {string} key - Key to expire.
   * @param {number} time - Expiration timestamp in ms.
   * @returns {Promise<void>}
   */
  async setExpire(key, time) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Remove the expiration of a key.
   * @abstract
   * @param {string} key - Key to remove expiration from.
   * @returns {Promise<void>}
   */
  async deleteExpire(key) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Check if a key is stored and not expired — whether get would find a value.
   * @abstract
   * @param {string} key - Key to check.
   * @returns {Promise<boolean>}
   */
  async has(key) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Keeps the encryption options (see StorageAdapterOptions).
   * @protected
   * @param {string|null|undefined} password - A non-empty string, or nothing.
   * @param {unknown} [keyDerivation] - "hkdf" or "pbkdf2"; nothing means "hkdf".
   * @throws {Error} If a password is given that is not a non-empty string, or the key derivation is unknown.
   */
  _setEncryption(password, keyDerivation) {
    if (password !== null && password !== undefined && (typeof password !== "string" || password.length === 0)) {
      throw new Error("Storagefy: password must be a non-empty string");
    }
    if (keyDerivation !== undefined && !cryptoHelper.isKeyDerivation(keyDerivation)) {
      throw new Error(`Storagefy: keyDerivation must be one of ${cryptoHelper.KEY_DERIVATIONS.join(", ")}`);
    }
    this.password = password || null;
    this.keyDerivation = keyDerivation ?? cryptoHelper.DEFAULT_KEY_DERIVATION;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Runs a write of a key after the writes of that key asked before it — the encryption before a write is
   * asynchronous, and two writes in a row could otherwise land in the reverse order, leaving the older value stored.
   * @protected
   * @template T
   * @param {string} key - The storage key.
   * @param {() => Promise<T>} write - The write (the adapters answer false instead of throwing).
   * @returns {Promise<T>}
   */
  _inOrder(key, write) {
    // After the previous write of the key and the operation on every key asked before, whatever their outcome: one
    // failure never stops the writes after it
    const current = Promise.allSettled([this._pendingWrites.get(key), this._barrier]).then(write);
    this._pendingWrites.set(key, current);
    const forget = () => {
      if (this._pendingWrites.get(key) === current) {
        this._pendingWrites.delete(key);
      }
    };
    current.then(forget, forget);
    return current;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Runs an operation on every key of the namespace (reset, clear) after every write asked before it — the writes asked
   * after it wait for it. Without it, a write asked before a reset could land after it and survive the reset.
   * @protected
   * @template T
   * @param {() => Promise<T>} operation - The operation (the adapters log instead of throwing).
   * @returns {Promise<T>}
   */
  _exclusive(operation) {
    const current = Promise.allSettled([this._barrier, ...this._pendingWrites.values()]).then(operation);
    this._barrier = current;
    return current;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Waits for the writes of a key and the operations on every key asked so far — a read after a write sees it, even
   * when the write was not awaited. Never rejects. Nothing inside a write reads (it would wait for itself).
   * @protected
   * @param {string} key - The storage key.
   * @returns {Promise<void>}
   */
  async _afterWrites(key) {
    await Promise.allSettled([this._pendingWrites.get(key), this._barrier]);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes a key found expired — in the key's queue, and only if it is still expired when its turn comes: a write
   * asked in the meantime (with a new expiration, or none) wins over the expiration seen before it.
   * @abstract
   * @protected
   * @param {string} key - The storage key.
   * @returns {Promise<void>} Never rejects.
   */
  async _expire(key) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The AES key of a storage key for a key derivation — derived on first use, then reused. A failed derivation is not
   * kept, so the next call tries again.
   * @protected
   * @param {string} key - The storage key.
   * @param {"hkdf"|"pbkdf2"} keyDerivation
   * @returns {Promise<CryptoKey>}
   */
  _cryptoKeyFor(key, keyDerivation) {
    const cacheKey = `${keyDerivation}:${key}`;
    let derived = this._derivedKeys.get(cacheKey);
    if (!derived) {
      // With the app's password the storage key is only the salt; without it, the key's name alone (as before 1.2)
      derived = this.password
        ? cryptoHelper.deriveKey(this.password, key, false, keyDerivation)
        : cryptoHelper.deriveKey(key, undefined, false, keyDerivation);
      this._derivedKeys.set(cacheKey, derived);
      derived.catch(() => this._derivedKeys.delete(cacheKey));
    }
    return derived;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The text to store for a value already turned into JSON — encrypted when the adapter encrypts.
   * @protected
   * @param {string} key - The storage key.
   * @param {string} json - The value, as JSON.
   * @returns {Promise<string|null>} What to store, or null when encryption failed.
   */
  async _encrypt(key, json) {
    if (!this.encrypt || !key) return json;
    try {
      const cKey = await this._cryptoKeyFor(key, this.keyDerivation);
      return JSON.stringify(await cryptoHelper.sealText(cKey, json, this.keyDerivation));
    } catch (err) {
      logError("Encryption failed:", err);
      return null;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The value of a stored text — decrypted the way it was written (1.3.0 format or 1.2.x).
   * @protected
   * @param {string} key - The storage key.
   * @param {string} stored - What was stored.
   * @returns {Promise<any>}
   * @throws {Error} If it is not JSON, does not decrypt or names an unknown key derivation.
   */
  async _decrypt(key, stored) {
    if (!this.encrypt || !key) return JSON.parse(stored);
    const envelope = JSON.parse(stored);
    if (envelope?.v === cryptoHelper.ENVELOPE_VERSION) {
      if (!cryptoHelper.isKeyDerivation(envelope.kdf)) {
        throw new Error(`Storagefy: unknown key derivation in stored value: ${String(envelope.kdf)}`);
      }
      const cKey = await this._cryptoKeyFor(key, envelope.kdf);
      return JSON.parse(await cryptoHelper.openText(cKey, envelope));
    }
    // Written by 1.2.x: PBKDF2, and the JSON text encrypted as a JSON string
    const cKey = await this._cryptoKeyFor(key, "pbkdf2");
    return JSON.parse(await cryptoHelper.decryptData(cKey, envelope, false));
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Tells a read that failed (see ReadOptions).
   * @protected
   * @param {string} key - The storage key.
   * @param {ReadOptions|undefined} options
   * @param {unknown} cause
   */
  _reportReadFailure(key, options, cause) {
    reportFailure("read", key, options?.onError, cause);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Calls back when a write of another tab reaches what this tab reads of a key — after its message, at times (see
   * WebStorageAdapter). None here: IndexedDB tells a write once its transaction is saved, and a read after the message
   * sees it.
   * @protected
   * @param {string} key - The storage key.
   * @param {() => void} callback
   * @returns {() => void} Stops it.
   */
  _onStoredChange(key, callback) {
    return () => {};
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Generate the full namespaced key (obfuscated when encrypting).
   * @protected
   * @param {string} key - The base key.
   * @returns {string}
   */
  _fullKey(key) {
    const full = `${this.prefix}${key}`;
    return this.encrypt ? cryptoHelper.simpleObfuscate(full) : full;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The key without the namespace, when a stored key belongs to this adapter (and to the prefix asked).
   * @protected
   * @param {string} storedKey - A key as stored (obfuscated when encrypting).
   * @param {string} [prefix=""] - Prefix of the keys asked for.
   * @returns {string|null}
   */
  _ownKey(storedKey, prefix = "") {
    const full = this.encrypt ? cryptoHelper.simpleDeobfuscate(storedKey) : storedKey;
    if (this._isRecord(storedKey) || this._isRecord(full) || !full.startsWith(this.prefix)) {
      return null;
    }
    const key = full.slice(this.prefix.length);
    return key.startsWith(prefix) ? key : null;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Whether a key is one of the namespace's own records (metadata, expirations, revisions) — never a key of the app.
   * @private
   * @param {string} key
   * @returns {boolean}
   */
  _isRecord(key) {
    return key === this.metaKey || key === this.expireKey || key === this.revisionKey;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The revision stored for a key, in the revisions record (keyed by the stored key, so an encrypted namespace shows
   * no key name).
   * @protected
   * @param {Object<string, unknown>} revisions - The revisions record.
   * @param {string} key - The storage key.
   * @returns {Revision|undefined}
   */
  _revisionIn(revisions, key) {
    const revision = revisions[this._fullKey(key)];
    return isRevision(revision) ? revision : undefined;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Removes the entry of a key from a record of the namespace (expirations, revisions).
   * @protected
   * @param {Object<string, any>} record
   * @param {string} key
   * @returns {boolean} Whether the key had one.
   */
  _removeEntry(record, key) {
    if (!(key in record)) {
      return false;
    }
    delete record[key];
    return true;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The keys and values of a table (the keys that start with `${tableName}__`) — every key of the namespace when no
   * table is given.
   * @param {string} [tableName] - Table prefix.
   * @returns {Promise<Array<{ key: string, value: any }>>}
   */
  async getAll(tableName) {
    return tableName === undefined ? this.list() : this.list(`${tableName}__`);
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
      return expires[key] || null;
    } catch (err) {
      logError(`Error getting expire for key '${key}':`, err);
      return null;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Whether an expiration timestamp has passed — the rule of get and has: a key without one never expires.
   * @protected
   * @param {number|undefined} expiresAt - The key's expiration timestamp (ms since the epoch).
   * @returns {boolean}
   */
  _isExpired(expiresAt) {
    return Boolean(expiresAt) && Date.now() >= expiresAt;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Starts the expiration watcher to periodically clear expired keys.
   * @protected
   */
  _startExpireWatcher() {
    if (this.expireCheckInterval <= 0) {
      return;
    }
    this._expireTimer = setInterval(() => {
      this.clearExpire();
    }, this.expireCheckInterval);
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Releases the adapter, once the writes already asked are done: stops the expiry watcher and closes the channel
   * between tabs (IndexedDB also closes its connection). Call it when the adapter is no longer used — it is not used
   * after.
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this._expireTimer) {
      clearInterval(this._expireTimer);
      this._expireTimer = null;
    }
    await Promise.allSettled([this._barrier, ...this._pendingWrites.values()]);
    this.channel?.close();
    this.channel = null;
    this.channelName = null;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Tells the other tabs about a change (when a channel is open).
   * @param {string} key - The key that changed.
   * @param {string|undefined} value - The stored value, when it goes with the message (localStorage, sessionStorage).
   * @param {string} origin - What happened.
   * @param {Revision} [revision] - The revision of the write.
   */
  emitDataChange(key, value, origin, revision) {
    if (!this.channelName || !origin) {
      return;
    }
    this.channel.emit({ adapterId: this.adapterId, dbName: this.dbName, key, value, origin, revision });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Listens for the changes other tabs tell.
   * @param {(change: DataChange) => void} callback
   * @returns {() => void} Stops listening (does nothing without a channel).
   */
  onDataChanged(callback) {
    if (!this.channelName || typeof callback !== "function") {
      return () => {};
    }
    return this.channel.subscribe(callback);
  }
}

// ------------------------------------------------------------------------------------------------

export default StorageAdapter;

// ------------------------------------------------------------------------------------------------
