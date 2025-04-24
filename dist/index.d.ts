import base64To from 'misc-helpers/src/utils/base64To.js';
import base64From from 'misc-helpers/src/utils/base64From.js';
import generateSimpleId from 'misc-helpers/src/utils/generateSimpleId.js';
import sleep from 'misc-helpers/src/utils/sleep.js';
import assign from 'misc-helpers/src/utils/assign.js';

/**
 * Global debug flag.
 * Set to `true` to enable logging.
 * @type {boolean}
 */
globalThis.storagefyDebug = true;

/**
 * Global debug level.
 * Controls the verbosity of logs.
 * 
 * Levels:
 * - 0: Only errors
 * - 1: Warnings
 * - 2: Info
 * - 3: Trace
 * 
 * @type {number}
 */
globalThis.storagefyDebugLevel = 0;

// ------------------------------------------------------------------------------------------------

/**
 * Logs an error message if `storagefyDebug` is enabled.
 * 
 * @param {...any} args - Arguments to log.
 */
const logError$1 = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 0) {
    args.unshift("Storagefy Error:");
    console.error(...args);
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Logs a warning message if `storagefyDebug` is enabled and level is >= 1.
 * 
 * @param {...any} args - Arguments to log.
 */
const logWarn = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 1) {
    args.unshift("Storagefy Warn:");
    console.warn(...args);
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Logs an info message if `storagefyDebug` is enabled and level is >= 2.
 * 
 * @param {...any} args - Arguments to log.
 */
const logInfo = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 2) {
    args.unshift("Storagefy:");
    console.info(...args);
  }
};

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

// ------------------------------------------------------------------------------------------------

let crypto;
let subtle;

// ------------------------------------------------------------------------------------------------

/**
 * Initializes the Web Crypto API depending on environment (Browser or Node).
 */
function getCrypto() {
  try {
    logInfo("CryptoHelper - Attempting to initialize crypto engine");

    if (typeof window !== "undefined" && window.crypto) {
      crypto = window.crypto;
      subtle = crypto.subtle;
      logInfo("CryptoHelper - Crypto initialized from window.crypto");
      return;
    }

    if (typeof global !== "undefined") {
      if (global.crypto?.webcrypto) {
        crypto = global.crypto.webcrypto;
        subtle = crypto.subtle;
        logInfo("CryptoHelper - Crypto initialized from global.webcrypto");
        return;
      }
    }

    throw new Error("Crypto API not available");
  } catch (error) {
    logError$1("Failed to initialize crypto:", error);
    throw error;
  }
}

try {
  getCrypto();
} catch (error) {
  logError$1("Failed to initialize crypto:", error);
}

// ------------------------------------------------------------------------------------------------

/**
 * Creates a key material from a password to be used in key derivation.
 * @private
 * @param {string} password - The password to convert.
 * @returns {Promise<CryptoKey>} A CryptoKey representing the key material.
 */
const generateKeyMaterial = async (password) => {
  try {
    logInfo("CryptoHelper - Generating key material from password");
    return subtle.importKey("raw", ENCODER.encode(password), "PBKDF2", false, [
      "deriveKey",
    ]);
  } catch (error) {
    logError$1("Error generating key material:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Derives a cryptographic key using PBKDF2 from a password and salt.
 * @param {string} password - The password.
 * @param {string} salt - The salt.
 * @param {boolean} [extractable=false] - Whether the derived key is extractable.
 * @returns {Promise<CryptoKey>} The derived key.
 */
const deriveKey = async (password, salt, extractable = false) => {
  try {
    if (typeof password !== "string" || !password.length) {
      throw new Error("Invalid password");
    }
    logInfo("CryptoHelper - Deriving key with PBKDF2", {
      passwordLength: password.length,
      extractable,
    });
    const keyMaterial = await generateKeyMaterial(password);
    return subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: ENCODER.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      extractable,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    logError$1("Error deriving key:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Encrypts a JavaScript object using AES-GCM.
 * @param {CryptoKey} key - The AES key.
 * @param {any} dataObj - The data to encrypt.
 * @param {boolean} [raw=false] - If true, returns raw bytes.
 * @returns {Promise<Object>} The encrypted data (base64 or raw format).
 */
const encryptData = async (key, dataObj, raw = false) => {
  if (
    dataObj === undefined ||
    typeof dataObj === "function" ||
    typeof dataObj === "symbol"
  ) {
    throw new Error("Invalid data type for encryption");
  }

  try {
    logInfo("CryptoHelper - Encrypting data", { raw });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = ENCODER.encode(JSON.stringify(dataObj));
    const encrypted = await subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded
    );

    if (raw) {
      return { iv, data: new Uint8Array(encrypted) };
    }

    const ivBase64 = base64To(String.fromCharCode(...iv));
    const encryptedBase64 = base64To(
      String.fromCharCode(...new Uint8Array(encrypted))
    );

    return { iv: ivBase64, data: encryptedBase64 };
  } catch (error) {
    logError$1("Error encrypting data:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Decrypts encrypted data using AES-GCM.
 * @param {CryptoKey} key - The AES key.
 * @param {Object} encryptedObj - Encrypted data.
 * @param {boolean} [raw=false] - Whether the encrypted data is in raw format.
 * @returns {Promise<any>} The decrypted original data.
 */
const decryptData = async (key, encryptedObj, raw = false) => {
  let iv, encrypted;

  try {
    logInfo("CryptoHelper - Decrypting data", { raw });

    if (raw) {
      iv = new Uint8Array(encryptedObj.iv);
      encrypted = new Uint8Array(encryptedObj.data);
    } else {
      const decodeBase64 = (b64) =>
        new Uint8Array(
          base64From(b64)
            .split("")
            .map((char) => char.charCodeAt(0))
        );
      iv = decodeBase64(encryptedObj.iv);
      encrypted = decodeBase64(encryptedObj.data);
    }

    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );

    return JSON.parse(DECODER.decode(decrypted));
  } catch (error) {
    logError$1("Error decrypting data:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Applies a simple obfuscation to a string:
 * 1. Shifts each character code by +1.
 * 2. Converts the result to base64 format using `base64To()`.
 *
 * This is useful for making strings less readable, though not secure.
 *
 * @param {string} str - The input string to obfuscate.
 * @returns {string} The obfuscated string.
 * @throws {Error} If the obfuscation process fails.
 */
function simpleObfuscate(str) {
  if (!str) return str;

  logInfo("CryptoHelper - Obfuscating string");

  try {
    // Shift each character's char code by +1
    const shifted = [...str]
      .map((char) => String.fromCharCode(char.charCodeAt(0) + 1))
      .join("");

    // Convert to base64
    return base64To(shifted);
  } catch (error) {
    return str;
  }
}

// ------------------------------------------------------------------------------------------------

/**
 * Reverses a previously obfuscated string:
 * 1. Decodes from base64 using `base64From()`.
 * 2. Shifts each character code by -1 to restore the original.
 *
 * @param {string} str - The obfuscated string to restore.
 * @returns {string} The original (deobfuscated) string.
 * @throws {Error} If the deobfuscation process fails.
 */
function simpleDeobfuscate(str) {
  if (!str) return str;

  logInfo("CryptoHelper - Deobfuscating string");

  try {
    // Decode base64
    const decoded = base64From(str);

    // Shift each character's char code back by -1
    return [...decoded]
      .map((char) => String.fromCharCode(char.charCodeAt(0) - 1))
      .join("");
  } catch (error) {
    return str;
  }
}

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------

/**
 * @class CrossTabChannel
 * A lightweight wrapper around the BroadcastChannel API for sending and receiving messages
 * between browser tabs or contexts under the same origin.
 *
 * This class provides a simple interface to emit data and subscribe to data changes
 * across tabs, making it ideal for syncing state in multi-tab applications.
 */
class CrossTabChannel {
  /**
   * Constructs a new CrossTabChannel instance using the specified channel name.
   *
   * @param {string} [channelName='storagefy_channel'] - The name of the BroadcastChannel.
   *                                                     Tabs sharing this name can communicate with each other.
   */
  constructor(channelName) {
    // Initialize the BroadcastChannel with the given name.
    try {
      if (typeof channelName !== "string") {
        channelName = generateSimpleId("storagefy_channel");
      }
      this.channel = new BroadcastChannel(channelName);
      this.channelName = channelName;
      logInfo(`CrossTabChannel initialized on channel "${channelName}"`);
    } catch (error) {
      logError$1("Failed to initialize BroadcastChannel:", error);
      throw error;
    }
  }

  // ------------------------------------------------------------------------------------------------

  /**
   * Subscribes to incoming messages on the channel.
   * The callback will be called with the message data whenever another tab posts a message.
   *
   * @param {Function} callback - A function that handles incoming message data.
   */
  subscribe(callback) {
    if (typeof callback !== "function") {
      logWarn("CrossTabChannel.subscribe: Provided callback is not a function.");
      return;
    }

    this.channel.onmessage = (event) => {
      logInfo("CrossTabChannel - Received message:", event.data);
      try {
        callback(event.data);
      } catch (error) {
        logError$1("Error in CrossTabChannel subscriber callback:", error);
      }
    };

    logInfo("CrossTabChannel - Subscribed to incoming messages.");
  }

  // ------------------------------------------------------------------------------------------------
  
  /**
   * Sends a message to all tabs subscribed to the same channel.
   *
   * @param {*} data - The data to broadcast. Must be serializable.
   */
  emit(data) {
    try {
      this.channel.postMessage(data);
      logInfo("CrossTabChannel - Emitted message:", data);
    } catch (error) {
      logError$1("CrossTabChannel.emit: Failed to send message:", error);
    }
  }

  // ------------------------------------------------------------------------------------------------

  /**
   * Closes the channel to stop listening for or sending messages.
   * This is useful for cleanup when the channel is no longer needed.
   */
  close() {
    try {
      this.channel.close();
      logInfo("CrossTabChannel - Channel closed.");
    } catch (error) {
      logError$1("CrossTabChannel.close: Error closing channel:", error);
    }
  }
}

// ------------------------------------------------------------------------------------------------

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
      const cKey = await deriveKey(key);
      const encrypted = await encryptData(cKey, value, false);
      logInfo(
        `StorageAdapter - Successfully encrypted value for key "${key}".`
      );
      return JSON.stringify(encrypted);
    } catch (err) {
      logError$1("Encryption failed:", err);
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
      const cKey = await deriveKey(key);
      const encryptedObj = JSON.parse(value);
      const decrypted = await decryptData(
        cKey,
        encryptedObj,
        false
      );
      logInfo(
        `StorageAdapter - Successfully decrypted value for key "${key}".`
      );
      return JSON.parse(decrypted);
    } catch (err) {
      logError$1("Decryption failed:", err);
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
      const obfuscated = simpleObfuscate(full);
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
        logError$1("Error clearing expired keys:", err);
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
      logError$1(`Error getting expire for key '${key}':`, err);
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
      logError$1("IndexedDB is not available in this environment");
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
          logError$1("Error checking meta:", err);
          resolve(db); // Still resolve with db even if meta check failed
        };
      };

      request.onerror = (event) => {
        logError$1("Error opening database:", event.target.error);
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
      let attempt = 0;
      while (!this.isReady && attempt++ <= tries) {
        if (this.isReady) {
          resolve();
          return true;
        }

        await sleep(timeout);
      }
      if (this.isReady) {
        resolve();
        return true;
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
      logError$1("Database operation failed:", err);
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
      logError$1(`Error getting key '${key}':`, err);
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
      logError$1(`Error setting key '${key}':`, err);
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
      logError$1(`Error deleting key '${key}':`, err);
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
      logError$1("Error listing keys:", err);
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
      logError$1(`Error checking key '${key}':`, err);
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
      logError$1("Error clearing storage:", err);
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
      logError$1("Error resetting storage:", error);
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
      logError$1(`Error setting expire for key '${key}':`, err);
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
      logError$1(`Error deleting expire for key '${key}':`, err);
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
      logError$1("Error clearing expired keys:", err);
    }
  }
}

// ----------------------------------------------------------------------------------------------

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
      logError$1("LocalStorage is not available in this environment");
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
      logError$1("Error initializing meta:", err);
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
      logError$1("Error loading expires:", err);
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
      logError$1(`Error getting key '${key}':`, err);
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
      logError$1(`Error setting key '${key}':`, err);
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
      logError$1(`Error deleting key '${key}':`, err);
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
      logError$1("Error listing keys:", err);
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
      logError$1(`Error checking key '${key}':`, err);
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
      logError$1("Error clearing storage:", err);
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
      logError$1("Error resetting storage:", error);
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
      logError$1(`Error setting expire for key '${key}':`, err);
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
      logError$1(`Error deleting expire for key '${key}':`, err);
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
      logError$1("Error clearing expired keys:", err);
    }
  }
}

// ----------------------------------------------------------------------------------------------

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
      logError$1("SessionStorage is not available in this environment");
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
      logError$1("Error initializing meta:", err);
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
      logError$1("Error loading expires:", err);
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
      logError$1(`Error getting key '${key}':`, err);
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
      logError$1(`Error setting key '${key}':`, err);
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
      logError$1(`Error deleting key '${key}':`, err);
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
      logError$1("Error listing keys:", err);
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
      logError$1(`Error checking key '${key}':`, err);
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
      logError$1("Error clearing storage:", err);
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
      logError$1("Error resetting storage:", error);
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
      logError$1(`Error setting expire for key '${key}':`, err);
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
      logError$1(`Error deleting expire for key '${key}':`, err);
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
      logError$1("Error clearing expired keys:", err);
    }
  }
}

// ----------------------------------------------------------------------------------------------

/**
 * Abstract base class for storage adapters. Provides the interface for concrete storage implementations.
 * All storage adapters should extend this class and implement its abstract methods.
 *
 * @module StoreAdapter
 * @abstract
 * @example
 * // Example of implementing a custom adapter:
 * class CustomAdapter extends StoreAdapter {
 *   async setInStorage(store, key, options) {
 *     // Implementation here
 *   }
 *   
 *   async getFromStorage(store, key) {
 *     // Implementation here
 *   }
 * }
 */

class StoreAdapter {
  /**
   * Stores data in the specified storage with the given key.
   * @abstract
   * @async
   * @param {string} store The name/identifier of the storage location
   * @param {string} key The key under which to store the data
   * @param {Object} [options={}] Storage options
   * @param {*} options.value The value to store
   * @param {string[]} [options.ignoreKeys] Array of keys to ignore in the stored value
   * @param {number} [options.timeout] Timeout in milliseconds for the operation
   * @returns {Promise<void>}
   * @throws {Error} Must be implemented by subclasses
   * @throws {Error} May throw on timeout or storage failure
   * @example
   * await adapter.setInStorage('userData', 'preferences', {
   *   value: { theme: 'dark', tokens: 'secret' },
   *   ignoreKeys: ['tokens'], // Will exclude these keys from storage
   *   timeout: 5000 // 5 second timeout
   * });
   */
  async setInStorage(store, key, options = {}) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieves data from the specified storage by key.
   * @abstract
   * @async
   * @param {string} store The name/identifier of the storage location
   * @param {string} key The key to retrieve
   * @param {number} [timeout] Optional timeout in milliseconds for the operation
   * @returns {Promise<*>} The stored value or null if not found
   * @throws {Error} Must be implemented by subclasses
   * @throws {Error} May throw on timeout or storage failure
   * @example
   * const preferences = await adapter.getFromStorage('userData', 'preferences', 2000); // 2 second timeout
   */
  async getFromStorage(store, key, timeout) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------
  
  /**
   * Cleans up resources and subscriptions when the adapter is no longer needed.
   * Should be called before discarding the adapter instance.
   * @returns {void}
   * @example
   * adapter.destroy();
   */
  destroy(key) {
    if (this.stores && this.stores[key] && typeof this.stores[key].unsubscribe === "function") {
      logInfo("StoreAdapter - destroy - Unsubscribing from store changes.");
      this.stores[key].unsubscribe;
      delete this.stores[key];
      return;
    }
    logInfo("StoreAdapter - destroy - No unsubscribe function to call.");
  }
}

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------

/**
 * Pinia storage adapter that syncs Pinia store state with a persistence layer.
 * @class PiniaAdapter
 * @extends StoreAdapter
 * @example
 * // Basic usage with IndexedDB adapter:
 * const piniaAdapter = new PiniaAdapter(new IndexedDBAdapter({ dbName: 'my-app' }));
 * await piniaAdapter.setInStorage(useUserStore(), 'user-state');
 * await piniaAdapter.getFromStorage(useUserStore(), 'user-state');
 */
class PiniaAdapter extends StoreAdapter {
  /**
   * Creates a PiniaAdapter instance.
   * @param {StoreAdapter} adapter The storage adapter to use for persistence (e.g., IndexedDBAdapter)
   * @throws {Error} Throws if no adapter is provided
   */
  constructor(adapter) {
    super();
    if (!adapter) {
      logError$1("Adapter provided is not defined");
      throw new Error("Adapter provided is not defined");
    }
    this.adapter = adapter;
    this.stores = {};
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Validates that a Pinia store has the required methods.
   * @private
   * @param {Object} store Pinia store instance to validate
   * @throws {Error} Throws if store is invalid or missing required methods
   */
  _checkStore(store) {
    if (!store || !store.$subscribe || !store.$patch) {
      logError$1("Store provided is not defined");
      throw new Error("Store provided is not defined");
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Registers a listener on the adapter to respond to external data changes,
   * ensuring the connected store is synchronized with updates that come
   * from other sources (e.g., different tabs or windows).
   *
   * @private
   * @param {String} key - The key to register the listener for
   */
  _registerOnDataChanged(key) {
    logInfo("PiniaAdapter - Registering onDataChanged listener");
    if (!key || !this.stores || !this.stores[key]) {
      return;
    }
    this.adapter.onDataChanged(async (data) => {
      try {
        if (data.adapterId == this.adapter.adapterId || !data.origin) {
          return;
        }

        if (
          !this.stores ||
          !this.stores[data.key] ||
          !this.stores[data.key].store
        ) {
          return;
        }

        let dataToPatch;
        if (!data.value) {
          dataToPatch = await this.adapter.get(data.key);
        } else {
          dataToPatch = await this.adapter._decrypt(data.key, data.value);
        }

        if (
          JSON.stringify(!this.stores[data.key].store.$state) ===
          JSON.stringify(dataToPatch)
        ) {
          return;
        }

        this.stores[data.key].store.$state = {
          ...this.stores[data.key].store.$state,
          ...dataToPatch,
          STORAGEFY_SILENT_CHANNEL_UPDATE: true,
        };
      } catch (error) {
        logError$1("PiniaAdapter - onDataChanged - error:", error);
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Syncs Pinia store state to persistent storage and sets up subscription for future changes.
   * @async
   * @param {Object} store Pinia store instance
   * @param {string} key Storage key to use
   * @param {Object} [options={}] Configuration options
   * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
   * @param {number} [options.timeout] Operation timeout in milliseconds
   * @returns {Promise<boolean>} Resolves to true on success
   * @throws {Error} Throws if store is invalid or persistence fails
   * @example
   * // Persist store while ignoring sensitive data
   * await piniaAdapter.setInStorage(useUserStore(), 'user-data', {
   *   ignoreKeys: ['password', 'token'],
   *   timeout: 5000
   * });
   */
  async setInStorage(store, key, options = {}) {
    try {
      logInfo("PiniaAdapter - setInStorage - key:", key);
      this._checkStore(store);
      options.ignoreKeys = options.ignoreKeys || [];

      if (
        this.stores[key] &&
        this.stores[key].unsubscribe &&
        typeof this.stores[key].unsubscribe === "function"
      ) {
        this.stores[key].unsubscribe();
      }
      delete this.stores[key];

      this.stores[key] = {
        key,
        options,
        store,
        unsubscribe: null,
      };

      return new Promise((resolve, reject) => {
        this.stores[key].unsubscribe = store.$subscribe(
          async (mutation, state) => {
            try {
              if (!state) {
                return resolve(true);
              }
              if (state.STORAGEFY_SILENT_CHANNEL_UPDATE) {
                delete state.STORAGEFY_SILENT_CHANNEL_UPDATE;
                return resolve(true);
              }

              const stateProps = { ...state };
              for (let propKey in stateProps) {
                if (options.ignoreKeys.includes(propKey)) {
                  stateProps[propKey] = undefined;
                }
              }

              await this.adapter.set(key, stateProps, options.timeout);

              return resolve(true);
            } catch (error) {
              return reject(error);
            }
          }
        );

        store.$patch({ ...store.$state });

        if (options.syncTabs) {
          this._registerOnDataChanged(key);
        }
      });
    } catch (error) {
      logError$1(error);
      throw error;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Loads persisted state into a Pinia store.
   * @async
   * @param {Object} store Pinia store instance to hydrate
   * @param {string} key Storage key to load from
   * @returns {Promise<boolean>} Resolves to true on success, undefined if no data found
   * @throws {Error} Throws if store is invalid or loading fails
   * @example
   * // Hydrate store from persisted state
   * await piniaAdapter.getFromStorage(useUserStore(), 'user-data');
   */
  async getFromStorage(store, key) {
    try {
      logInfo("PiniaAdapter - getFromStorage - key:", key);
      this._checkStore(store);
      const storage = await this.adapter.get(key);

      if (!storage) {
        return;
      }

      store.$patch(assign({}, storage));
      return true;
    } catch (error) {
      logError$1(error);
      throw error;
    }
  }
}

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------

/**
 * React state persistence adapter that syncs React state management stores with a storage backend.
 * Supports Redux, Zustand, and other React state management libraries with compatible interfaces.
 * @class ReactAdapter
 * @extends StoreAdapter
 * @example
 * // Basic usage with Redux and IndexedDB
 * const reduxAdapter = new ReactAdapter(new IndexedDBAdapter({ dbName: 'app-state' }));
 * await reduxAdapter.setInStorage(store, 'redux-state');
 * await reduxAdapter.getFromStorage(store, 'redux-state');
 *
 * // Usage with Zustand
 * const zustandAdapter = new ReactAdapter(new LocalStorageAdapter());
 * await zustandAdapter.setInStorage(useStore, 'zustand-state');
 */
class ReactAdapter extends StoreAdapter {
  /**
   * Creates a ReactAdapter instance.
   * @param {StoreAdapter} adapter The storage adapter to use for persistence (IndexedDB, LocalStorage, etc.)
   * @throws {Error} Throws if no adapter is provided
   */
  constructor(adapter) {
    super();
    if (!adapter) {
      logError$1("Adapter provided is not defined");
      throw new Error("Adapter provided is not defined");
    }
    this.adapter = adapter;
    this.stores = {};
  }

  // ----------------------------------------------------------------------------------------------

  _getPayload(current, payload) {
    return {
      ...current,
      ...payload,
      STORAGEFY_SILENT_CHANNEL_UPDATE: true,
    };
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Registers a listener on the adapter to respond to external data changes,
   * ensuring the connected store is synchronized with updates that come
   * from other sources (e.g., different tabs or windows).
   *
   * @private
   * @param {Object} store - A reactive store (e.g., a Redux, Jotai, Zustand or Custom store) that will be updated when external changes occur.
   */
  _registerOnDataChanged(key) {
    if (!key || !this.stores || !this.stores[key]) {
      return;
    }
    logInfo("ReactAdapter - Registering onDataChanged listener");
    this.adapter.onDataChanged(async (data) => {
      try {
        // Skip if the data change originated from this adapter or has no origin
        if (data.adapterId == this.adapter.adapterId || !data.origin) {
          return;
        }

        if (
          !this.stores ||
          !this.stores[data.key] ||
          !this.stores[data.key].store
        ) {
          return;
        }
        const store = this.stores[data.key].store;

        let dataToPatch;
        if (!data.value) {
          dataToPatch = await this.adapter.get(data.key);
        } else {
          dataToPatch = await this.adapter._decrypt(data.key, data.value);
        }

        // Redux store (has dispatch and getState methods)
        if (
          typeof store.dispatch === "function" &&
          typeof store.getState === "function"
        ) {
          const currentState = store.getState();
          if (JSON.stringify(currentState) === JSON.stringify(dataToPatch)) {
            return;
          }

          store.dispatch({
            type: "STORAGEFY_UPDATE",
            payload: this._getPayload(currentState, dataToPatch),
          });
          return;
        }

        // Zustand store
        if (
          typeof store.getState === "function" &&
          typeof store.setState === "function"
        ) {
          const currentState = store.getState();
          if (JSON.stringify(currentState) === JSON.stringify(dataToPatch)) {
            return;
          }
          store.setState(this._getPayload(currentState, dataToPatch));
          return;
        }

        // JOTAI
        if (
          typeof store.set === "function" &&
          typeof store.get === "function"
        ) {
          const currentState = store.get();
          if (JSON.stringify(currentState) === JSON.stringify(dataToPatch)) {
            return;
          }

          store.set(this._getPayload(currentState, dataToPatch));
          return;
        }

        if (typeof store.update === "function") {
          store.update((state) => {
            if (JSON.stringify(state) === JSON.stringify(dataToPatch)) {
              return state;
            }
            return this._getPayload(state, dataToPatch);
          });
          return;
        }

        // Last resort: try to find a method to update the store
        const currentState =
          typeof store.getState === "function"
            ? store.getState()
            : typeof store.get === "function"
            ? store.get()
            : {};

        if (JSON.stringify(currentState) === JSON.stringify(dataToPatch)) {
          return;
        }

        if (typeof store.set === "function") {
          store.set(this._getPayload(currentState, dataToPatch));
        } else {
          logError$1("Unable to update store: No compatible update method found");
        }
      } catch (error) {
        logError$1("Error in _registerOnDataChanged:", error);
      }
    });
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Syncs React store state to persistent storage and sets up subscription for future changes.
   * Supports both Redux-style (getState/subscribe) and Zustand-style stores.
   * @async
   * @param {Object} store React state store instance (Redux, Zustand, etc.)
   * @param {string} key Storage key to use
   * @param {Object} [options={}] Configuration options
   * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
   * @param {number} [options.timeout] Operation timeout in milliseconds
   * @returns {Promise<boolean>} Resolves to true when subscription is established
   * @throws {Error} Throws if store is invalid or unsupported
   * @example
   * // Persist Redux store while ignoring sensitive data
   * await reactAdapter.setInStorage(reduxStore, 'user-state', {
   *   ignoreKeys: ['authToken', 'password'],
   *   timeout: 3000
   * });
   *
   * // Persist Zustand store
   * await reactAdapter.setInStorage(zustandStore, 'app-settings');
   */
  async setInStorage(store, key, options = {}) {
    try {
      logInfo("ReactAdapter - setInStorage - key:", key);
      this._checkStore(store);
      options.ignoreKeys = options.ignoreKeys || [];

      if (
        this.stores[key] &&
        this.stores[key].unsubscribe &&
        typeof this.stores[key].unsubscribe === "function"
      ) {
        this.stores[key].unsubscribe();
      }
      delete this.stores[key];

      this.stores[key] = {
        key,
        options,
        store,
        unsubscribe: null,
      };

      return new Promise((resolve, reject) => {
        const handleStateChange = async (state) => {
          try {
            if (!state) return;
            if (state.STORAGEFY_SILENT_CHANNEL_UPDATE) {
              delete state.STORAGEFY_SILENT_CHANNEL_UPDATE;
              return resolve(true);
            }

            const stateProps = { ...state };
            for (let propKey in stateProps) {
              if (options.ignoreKeys.includes(propKey)) {
                stateProps[propKey] = undefined;
              }
            }

            await this.adapter.set(key, stateProps, options.timeout);
          } catch (error) {
            // Don't reject the main promise here - just log the error
            logError$1(error);
          }
        };

        // For Redux-style stores
        if (
          typeof store.subscribe === "function" &&
          typeof store.getState === "function"
        ) {
          // Initial sync
          handleStateChange(store.getState());

          // Subscribe to changes
          this.stores[key].unsubscribe = store.subscribe(() => {
            handleStateChange(store.getState());
          });
        }
        // For Zustand/useState-style stores
        else if (typeof store.subscribe === "function") {
          this.stores[key].unsubscribe = store.subscribe(handleStateChange);
        } else {
          reject(new Error("Unsupported store type"));
          return;
        }

        // Resolve immediately after subscription is set up
        if (options.syncTabs) {
          this._registerOnDataChanged(key);
        }
        resolve(true);
      });
    } catch (error) {
      logError$1(error);
      throw error;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Hydrates a React store from persistent storage.
   * Supports both Redux (dispatch) and Zustand (setState) update patterns.
   * @async
   * @param {Object} store React state store instance to hydrate
   * @param {string} key Storage key to load from
   * @returns {Promise<boolean>} Resolves to true on success, undefined if no data found
   * @throws {Error} Throws if store is invalid or update fails
   * @example
   * // Hydrate Redux store
   * await reactAdapter.getFromStorage(reduxStore, 'user-state');
   *
   * // Hydrate Zustand store
   * await reactAdapter.getFromStorage(zustandStore, 'app-settings');
   */
  async getFromStorage(store, key) {
    try {
      logInfo("ReactAdapter - getFromStorage - key:", key);
      this._checkStore(store);
      const storage = await this.adapter.get(key);
      if (!storage) {
        return;
      }

      // Handle different React state management libraries
      if (typeof store.dispatch === "function") {
        // For Redux, dispatch an action to update state
        store.dispatch({
          type: "SET_STATE_FROM_STORAGE",
          payload: storage,
        });
      } else if (typeof store.setState === "function") {
        // For Zustand or custom React hook store
        store.setState(assign({}, storage));
      } else {
        throw new Error(
          "Cannot update store: setState or dispatch method not found"
        );
      }

      return true;
    } catch (error) {
      logError$1(error);
      throw error;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Validates that a store has the required interface methods.
   * @private
   * @param {Object} store Store instance to validate
   * @throws {Error} Throws if store is invalid or missing required methods
   */
  _checkStore(store) {
    if (!store) {
      logError$1("Store provided is not defined");
      throw new Error("Store provided is not defined");
    }

    // Check if it's a Redux store
    if (
      typeof store.getState === "function" &&
      typeof store.dispatch === "function" &&
      typeof store.subscribe === "function"
    ) {
      // Valid Redux store, no further checks needed
      return;
    }

    // Check if it's a Zustand store
    if (
      typeof store.getState === "function" &&
      typeof store.setState === "function" &&
      typeof store.subscribe === "function"
    ) {
      // Valid Zustand store, no further checks needed
      return;
    }

    // Check if it's a Jotai atom
    if (
      Array.isArray(store) &&
      store.length === 2 &&
      typeof store[0] === "function" &&
      typeof store[1] === "function"
    ) {
      // Valid Jotai atom pair (getter/setter), no further checks needed
      return;
    }

    // Check for custom store with minimum required methods
    const hasGetState =
      typeof store.getState === "function" ||
      typeof store._getState === "function";
    const hasSetState =
      typeof store.setState === "function" ||
      typeof store._setState === "function";
    const hasSubscribe = typeof store.subscribe === "function";

    if (!hasSubscribe) {
      logError$1("Store must have a subscribe method");
      throw new Error("Store must have a subscribe method");
    }

    if (!hasGetState && !hasSetState) {
      logError$1(
        "Store must have either getState/setState or _getState/_setState methods"
      );
      throw new Error(
        "Store must have either getState/setState or _getState/_setState methods"
      );
    }
  }
}

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------

/**
 * Svelte store adapter that syncs Svelte writable stores with persistent storage.
 * Provides seamless integration between Svelte's store contract and various storage backends.
 * @class SvelteAdapter
 * @extends StoreAdapter
 * @example
 * // Basic usage with a Svelte writable store
 * import { writable } from 'svelte/store';
 * import { IndexedDBAdapter } from 'storagefy';
 *
 * const userStore = writable({});
 * const svelteAdapter = new SvelteAdapter(new IndexedDBAdapter({ dbName: 'svelte-app' }));
 *
 * // Persist store state
 * await svelteAdapter.setInStorage(userStore, 'user-data');
 *
 * // Hydrate store from storage
 * await svelteAdapter.getFromStorage(userStore, 'user-data');
 */
class SvelteAdapter extends StoreAdapter {
  /**
   * Creates a SvelteAdapter instance.
   * @param {StoreAdapter} adapter The storage adapter to use for persistence (IndexedDB, LocalStorage, etc.)
   * @throws {Error} Throws if no adapter is provided
   */
  constructor(adapter) {
    super();
    if (!adapter) {
      logError$1("Adapter provided is not defined");
      throw new Error("Adapter provided is not defined");
    }
    this.adapter = adapter;
    this.stores = {};
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Registers a listener on the adapter to respond to external data changes,
   * ensuring the connected store is synchronized with updates that come
   * from other sources (e.g., different tabs or windows).
   *
   * @private
   * @param {String} key - The key to register the listener for
   */
  _registerOnDataChanged(key) {
    logInfo("SvelteAdapter - Registering onDataChanged listener");
    if (!key || !this.stores || !this.stores[key]) {
      return;
    }
    try {
      if (!store) {
        return;
      }
      this.adapter.onDataChanged(async (data) => {
        if (data.adapterId == this.adapter.adapterId || !data.origin) {
          return;
        }

        if (
          !this.stores ||
          !this.stores[data.key] ||
          !this.stores[data.key].store
        ) {
          return;
        }

        let currentState;
        const unsubscribe = this.stores[data.key].store.subscribe((value) => {
          currentState = assign({}, value);
        });
        unsubscribe();

        let dataToPatch;
        if (!data.value) {
          dataToPatch = await this.adapter.get(data.key);
        } else {
          dataToPatch = await this.adapter._decrypt(data.key, data.value);
        }
        if (JSON.stringify(currentState) === JSON.stringify(dataToPatch)) {
          return;
        }

        // Update store with the patched data
        // In Svelte, we update the store directly
        this.stores[data.key].store.update((currentState) => ({
          ...currentState,
          ...dataToPatch,
          STORAGEFY_SILENT_CHANNEL_UPDATE: true,
        }));
      });
    } catch (error) {
      logError$1("SvelteAdapter - onDataChanged error:", error);
      throw error;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Syncs a Svelte store to persistent storage and sets up subscription for future changes.
   * @async
   * @param {Object} store Svelte writable store instance
   * @param {string} key Storage key to use
   * @param {Object} [options={}] Configuration options
   * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
   * @param {number} [options.timeout] Operation timeout in milliseconds
   * @returns {Promise<boolean>} Resolves to true when initial sync completes
   * @throws {Error} Throws if store is invalid or persistence fails
   * @example
   * // Persist store while ignoring sensitive fields
   * await svelteAdapter.setInStorage(userStore, 'user-profile', {
   *   ignoreKeys: ['password', 'token'],
   *   timeout: 2000
   * });
   */
  async setInStorage(store, key, options = {}) {
    try {
      logInfo("SvelteAdapter - setInStorage - key:", key);
      this._checkStore(store);
      options.ignoreKeys = options.ignoreKeys || [];

      if (
        this.stores[key] &&
        this.stores[key].unsubscribe &&
        typeof this.stores[key].unsubscribe === "function"
      ) {
        this.stores[key].unsubscribe();
      }
      delete this.stores[key];

      this.stores[key] = {
        key,
        options,
        store,
        unsubscribe: null,
      };

      return new Promise((resolve, reject) => {
        this.stores[key].unsubscribe = store.subscribe(async (state) => {
          try {
            if (!state) {
              return resolve(true);
            }

            const stateProps = { ...state };
            for (let propKey in stateProps) {
              if (options.ignoreKeys.includes(propKey)) {
                stateProps[propKey] = undefined;
              }
            }

            await this.adapter.set(key, stateProps, options.timeout);
            return resolve(true);
          } catch (error) {
            return reject(error);
          }
        });

        if (options.syncTabs) {
          this._registerOnDataChanged(key);
        }
      });
    } catch (error) {
      logError$1(error);
      throw error;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Hydrates a Svelte store from persistent storage.
   * @async
   * @param {Object} store Svelte writable store instance to hydrate
   * @param {string} key Storage key to load from
   * @returns {Promise<boolean>} Resolves to true on success, undefined if no data found
   * @throws {Error} Throws if store is invalid or update fails
   * @example
   * // Load persisted state into store
   * await svelteAdapter.getFromStorage(userStore, 'user-profile');
   */
  async getFromStorage(store, key) {
    try {
      logInfo("SvelteAdapter - getFromStorage - key:", key);
      this._checkStore(store);
      const storage = await this.adapter.get(key);
      if (!storage) {
        return;
      }
      store.set(assign({}, storage));
      return true;
    } catch (error) {
      logError$1(error);
      throw error;
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Validates that a store conforms to Svelte's writable store contract.
   * @private
   * @param {Object} store Store instance to validate
   * @throws {Error} Throws if store doesn't have required subscribe and set methods
   */
  _checkStore(store) {
    if (
      !store ||
      typeof store.subscribe !== "function" ||
      typeof store.set !== "function"
    ) {
      logError$1("Store provided is not a valid Svelte writable store");
      throw new Error("Store provided is not a valid Svelte writable store");
    }
  }
}

// ------------------------------------------------------------------------------------------------

// ------------------------------------------------------------------------------------------------
// Constants and Configuration
// ------------------------------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  dbName: "storagefy",
  storeName: "storagefy_db",
  version: 1,
  encrypt: false,
  expireCheckInterval: 1000,
  description: "Storagefy database",
  adapter: "indexedDB"
};

// ------------------------------------------------------------------------------------------------
// Storage Management
// ------------------------------------------------------------------------------------------------

let storageAdapter;
let piniaAdapter;
let reactAdapter;
let svelteAdapter;

/**
 * Initializes and returns a storage adapter instance.
 * @param {Object} config Configuration options
 * @param {string} [config.dbName="storagefy"] Database name
 * @param {string} [config.storeName="storagefy_db"] Store name
 * @param {number} [config.version=1] Database version
 * @param {boolean} [config.encrypt=false] Enable encryption
 * @param {string|boolean} [config.channelName=false] Channel name for storage communication between tabs
 * @param {number} [config.expireCheckInterval=1000] Expiration check interval
 * @param {string} [config.description="Storagefy database"] Database description
 * @param {boolean} [config.forceRecreate=false] Force recreation of adapter
 * @param {boolean} [config.fresh=false] Force creation of new adapter and return a new instance - does not re-use existing adapter or update it
 * @param {"indexedDB"|"localStorage"|"sessionStorage"} [config.adapter="indexedDB"] Storage adapter type
 * @returns {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter} Storage adapter instance
 * @throws {Error} If adapter initialization fails
 * @example
 * // Basic usage
 * const adapter = startStoragefy({ dbName: 'my-app' });
 * 
 * // With encryption
 * const secureAdapter = startStoragefy({
 *   dbName: 'secure-app',
 *   encrypt: true,
 *   password: 'my-secret-password'
 * });
 */
function startStoragefy(config = {}) {
  const params = { ...DEFAULT_CONFIG, ...config };

  if (!config.forceRecreate && storageAdapter) {
    return storageAdapter;
  }

  switch (params.adapter) {
    case "localStorage":
      if (config.fresh) {
        return new LocalStorageAdapter(params);
      }
      storageAdapter = new LocalStorageAdapter(params);
      break;
    case "sessionStorage":
      if (config.fresh) {
        return new SessionStorageAdapter(params);
      }
      storageAdapter = new SessionStorageAdapter(params);
      break;
    default:
      if (config.fresh) {
        return new IndexedDBAdapter(params);
      }
      storageAdapter = new IndexedDBAdapter(params);
  }

  return storageAdapter;
}

// ------------------------------------------------------------------------------------------------

/**
 * Retrieves the current storage adapter instance.
 * @returns {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter} Storage adapter instance
 * @throws {Error} If adapter is not initialized
 */
function getStorageAdapter() {
  if (!storageAdapter) {
    throw new Error("Storage adapter not initialized. Call startStoragefy first.");
  }
  return storageAdapter;
}

// ------------------------------------------------------------------------------------------------
// Framework Adapter Factories
// ------------------------------------------------------------------------------------------------

/**
 * Creates or retrieves a framework-specific adapter with consistent interface.
 * @private
 * @param {Object} options Options for adapter creation
 * @param {Object} [options.adapter] Pre-configured storage adapter
 * @param {Object} [options.adapterParams] Parameters to create new storage adapter
 * @param {boolean} [options.forceRecreate=false] Force recreation of adapter
 * @param {Object} cachedAdapter Reference to cached adapter
 * @param {Function} AdapterClass Class to instantiate
 * @returns {Object} Framework adapter instance
 */
function _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, cachedAdapter, AdapterClass) {
  if (adapter) {
    return new AdapterClass(adapter);
  }

  if (cachedAdapter && !forceRecreate) {
    return cachedAdapter;
  }

  if (adapterParams) {
    const storageAdapter = _createStorageAdapter(adapterParams);
    return new AdapterClass(storageAdapter);
  }

  if (!storageAdapter) {
    throw new Error("Storage adapter not initialized. Call startStoragefy first.");
  }

  return new AdapterClass(storageAdapter);
}

// ------------------------------------------------------------------------------------------------

/**
 * Creates a storage adapter based on parameters.
 * @private
 * @param {Object} params Adapter parameters
 * @returns {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter} Storage adapter
 */
function _createStorageAdapter(params) {
  switch (params.adapter) {
    case "localStorage":
      return new LocalStorageAdapter(params);
    case "sessionStorage":
      return new SessionStorageAdapter(params);
    default:
      return new IndexedDBAdapter(params);
  }
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets a Pinia store adapter instance.
 * @param {Object} options Configuration options
 * @param {Object} [options.adapter] Pre-configured storage adapter
 * @param {Object} [options.adapterParams] Parameters to create new storage adapter
 * @param {boolean} [options.forceRecreate=false] Force recreation of adapter
 * @param {boolean} [options.fresh=false] Force creation of new adapter and return a new instance - does not re-use existing adapter or update it
 * @returns {{setInStorage: Function, getFromStorage: Function}} Pinia adapter methods
 * @throws {Error} If adapter cannot be created
 */
function getPiniaAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, PiniaAdapter);
  }
  piniaAdapter = _getFrameworkAdapter(
    { adapter, adapterParams, forceRecreate },
    piniaAdapter,
    PiniaAdapter
  );
  return {
    setInStorage: piniaAdapter.setInStorage.bind(piniaAdapter),
    getFromStorage: piniaAdapter.getFromStorage.bind(piniaAdapter)
  };
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets a React store adapter instance.
 * @param {Object} options Configuration options
 * @param {Object} [options.adapter] Pre-configured storage adapter
 * @param {Object} [options.adapterParams] Parameters to create new storage adapter
 * @param {boolean} [options.forceRecreate=false] Force recreation of adapter
 * @param {boolean} [options.fresh=false] Force creation of new adapter and return a new instance - does not re-use existing adapter or update it
 * @returns {ReactAdapter} React adapter instance
 * @throws {Error} If adapter cannot be created
 */
function getReactAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, ReactAdapter);
  }
  reactAdapter = _getFrameworkAdapter(
    { adapter, adapterParams, forceRecreate },
    reactAdapter,
    ReactAdapter
  );
  return reactAdapter;
}

// ------------------------------------------------------------------------------------------------

/**
 * Gets a Svelte store adapter instance.
 * @param {Object} options Configuration options
 * @param {Object} [options.adapter] Pre-configured storage adapter
 * @param {Object} [options.adapterParams] Parameters to create new storage adapter
 * @param {boolean} [options.forceRecreate=false] Force recreation of adapter
 * @param {boolean} [options.fresh=false] Force creation of new adapter and return a new instance - does not re-use existing adapter or update it
 * @returns {SvelteAdapter} Svelte adapter instance
 * @throws {Error} If adapter cannot be created
 */
function getSvelteAdapter({ adapter = null, adapterParams = null, forceRecreate = false, fresh = false } = {}) {
  if (fresh) {
    return _getFrameworkAdapter({ adapter, adapterParams, forceRecreate }, null, SvelteAdapter);
  }
  svelteAdapter = _getFrameworkAdapter(
    { adapter, adapterParams, forceRecreate },
    svelteAdapter,
    SvelteAdapter
  );
  return svelteAdapter;
}

// ------------------------------------------------------------------------------------------------

async function setPiniaStorage(store, key, options = {}) {
  try {
    if (!piniaAdapter) {
      getPiniaAdapter();
    }
    if (!store) {
      throw new Error("Store is required.");
    }
    if (!key) {
      throw new Error("Key is required.");
    }
    await piniaAdapter.getFromStorage(store, key);
    await piniaAdapter.setInStorage(store, key, options);
  } catch (error) {
    logError(error);
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------

async function setReactStorage(store, key, options = {}) {
  try {
    if (!reactAdapter) {
      getReactAdapter();
    }
    if (!store) {
      throw new Error("Store is required.");
    }
    if (!key) {
      throw new Error("Key is required.");
    }
    await reactAdapter.getFromStorage(store, key);
    await reactAdapter.setInStorage(store, key, options);
  } catch (error) {
    logError(error);
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------

async function setSvelteStorage(store, key, options = {}) {
  try {
    if (!svelteAdapter) {
      getSvelteAdapter();
    }
    if (!store) {
      throw new Error("Store is required.");
    }
    if (!key) {
      throw new Error("Key is required.");
    }
    await svelteAdapter.getFromStorage(store, key);
    await svelteAdapter.setInStorage(store, key, options);
  } catch (error) {
    logError(error);
    throw error;
  }
}

export { IndexedDBAdapter, LocalStorageAdapter, PiniaAdapter, ReactAdapter, SessionStorageAdapter, SvelteAdapter, getPiniaAdapter, getReactAdapter, getStorageAdapter, getSvelteAdapter, setPiniaStorage, setReactStorage, setSvelteStorage, startStoragefy };
