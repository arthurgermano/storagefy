import * as cryptoHelper from "../helpers/cryptoHelper.js";
import CrossTabChannel from "../helpers/CrossTabChannel.js";
import { reportFailure } from "../helpers/failureReport.js";
import { logInfo, logWarn, logError } from "../helpers/loggerHelper.js";
class StorageAdapter {
  /**
   * @param {string|false} [channelName] - Name of the channel between tabs; without it, nothing is told to other tabs.
   */
  constructor(channelName) {
    this._derivedKeys = /* @__PURE__ */ new Map();
    this._pendingWrites = /* @__PURE__ */ new Map();
    this._barrier = Promise.resolve();
    this.keyDerivation = cryptoHelper.DEFAULT_KEY_DERIVATION;
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
   * @abstract
   * @param {string} key - The storage key.
   * @param {ReadOptions} [options]
   * @returns {Promise<any>} The value, or null when absent, expired or unreadable.
   */
  async get(key, options) {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Store a value under a key. Writes of the same key are applied in the order they were called.
   * @abstract
   * @param {string} key - The storage key.
   * @param {any} value - The value to store (JSON); null or undefined removes the key.
   * @param {number} [expire] - Expiration in milliseconds from now.
   * @returns {Promise<boolean|null>} true when stored, false when it failed, null when the key was removed.
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
   */
  async delete(key) {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The keys and values whose key starts with a prefix.
   * @abstract
   * @param {string} [prefix=""] - Prefix of the keys (without the namespace).
   * @returns {Promise<Array<{ key: string, value: any }>>}
   */
  async list(prefix = "") {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Remove every key of the namespace (the metadata stays).
   * @abstract
   * @returns {Promise<void>}
   */
  async reset() {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Remove every key of the namespace and its metadata.
   * @abstract
   * @returns {Promise<void>}
   */
  async clear() {
    throw new Error("Not implemented");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Remove all expired keys.
   * @abstract
   * @returns {Promise<void>}
   */
  async clearExpire() {
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
    if (password !== null && password !== void 0 && (typeof password !== "string" || password.length === 0)) {
      throw new Error("Storagefy: password must be a non-empty string");
    }
    if (keyDerivation !== void 0 && !cryptoHelper.isKeyDerivation(keyDerivation)) {
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
      derived = this.password ? cryptoHelper.deriveKey(this.password, key, false, keyDerivation) : cryptoHelper.deriveKey(key, void 0, false, keyDerivation);
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
      const cKey2 = await this._cryptoKeyFor(key, envelope.kdf);
      return JSON.parse(await cryptoHelper.openText(cKey2, envelope));
    }
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
    if (full === this.metaKey || full === this.expireKey || !full.startsWith(this.prefix)) {
      return null;
    }
    const key = full.slice(this.prefix.length);
    return key.startsWith(prefix) ? key : null;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The keys and values of a table (the keys that start with `${tableName}__`) — every key of the namespace when no
   * table is given.
   * @param {string} [tableName] - Table prefix.
   * @returns {Promise<Array<{ key: string, value: any }>>}
   */
  async getAll(tableName) {
    return tableName === void 0 ? this.list() : this.list(`${tableName}__`);
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
   */
  emitDataChange(key, value, origin) {
    if (!this.channelName || !origin) {
      return;
    }
    this.channel.emit({ adapterId: this.adapterId, dbName: this.dbName, key, value, origin });
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Listens for the changes other tabs tell.
   * @param {(change: DataChange) => void} callback
   * @returns {() => void} Stops listening (does nothing without a channel).
   */
  onDataChanged(callback) {
    if (!this.channelName || typeof callback !== "function") {
      return () => {
      };
    }
    return this.channel.subscribe(callback);
  }
}
var StorageAdapter_default = StorageAdapter;
export {
  StorageAdapter_default as default
};
//# sourceMappingURL=StorageAdapter.js.map