export default StorageAdapter;
/**
 * @class StorageAdapter
 * @abstract
 * Base class for implementing storage adapters with optional encryption and expiration.
 *
 * Subclasses must implement core storage methods such as `get`, `set`, `delete`, etc.
 * This class optionally sets up a cross-tab communication channel for broadcasting and
 * receiving data changes across browser tabs or contexts.
 */
declare class StorageAdapter {
    /**
     * Constructs a new StorageAdapter instance.
     *
     * @param {string} [channelName] - Optional name of the communication channel to enable cross-tab syncing.
     *                                 If provided, a CrossTabChannel is initialized for emitting and receiving changes.
     */
    constructor(channelName?: string);
    _derivedKeys: Map<any, any>;
    channelName: string;
    channel: CrossTabChannel;
    /**
     * Retrieve the value for a given key.
     * @abstract
     * @param {string} key - The storage key.
     * @returns {Promise<any>}
     * @throws Will throw if not implemented.
     */
    get(key: string): Promise<any>;
    /**
     * Store a value under a key.
     * @abstract
     * @param {string} key - The storage key.
     * @param {any} value - The value to store.
     * @param {number} [expire] - Optional expiration in milliseconds from now.
     * @returns {Promise<void>}
     * @throws Will throw if not implemented.
     */
    set(key: string, value: any, expire?: number): Promise<void>;
    /**
     * Delete a specific key.
     * @abstract
     * @param {string} key - The storage key to remove.
     * @returns {Promise<void>}
     * @throws Will throw if not implemented.
     */
    delete(key: string): Promise<void>;
    /**
     * List all keys with a given prefix.
     * @abstract
     * @param {string} [prefix=""] - Prefix to filter keys.
     * @returns {Promise<string[]>}
     * @throws Will throw if not implemented.
     */
    list(prefix?: string): Promise<string[]>;
    /**
     * Reset the entire adapter (e.g., delete all tables, indexes, etc.).
     * @abstract
     * @returns {Promise<void>}
     * @throws Will throw if not implemented.
     */
    reset(): Promise<void>;
    /**
     * Clear all stored values.
     * @abstract
     * @returns {Promise<void>}
     * @throws Will throw if not implemented.
     */
    clear(): Promise<void>;
    /**
     * Remove all expired keys.
     * @abstract
     * @returns {Promise<void>}
     * @throws Will throw if not implemented.
     */
    clearExpire(): Promise<void>;
    /**
     * Set an expiration time (in ms) for a given key.
     * @abstract
     * @param {string} key - Key to expire.
     * @param {number} time - Expiration timestamp in ms.
     * @returns {Promise<void>}
     * @throws Will throw if not implemented.
     */
    setExpire(key: string, time: number): Promise<void>;
    /**
     * Remove expiration for a specific key.
     * @abstract
     * @param {string} key - Key to remove expiration from.
     * @returns {Promise<void>}
     * @throws Will throw if not implemented.
     */
    deleteExpire(key: string): Promise<void>;
    /**
     * Check if a key exists.
     * @abstract
     * @param {string} key - Key to check.
     * @returns {Promise<boolean>}
     * @throws Will throw if not implemented.
     */
    has(key: string): Promise<boolean>;
    /**
     * Keeps the app's encryption password (see the adapters' `password` option).
     * @protected
     * @param {string|null|undefined} password - A non-empty string, or nothing.
     * @throws {Error} If a password is given that is not a non-empty string.
     */
    protected _setPassword(password: string | null | undefined): void;
    password: string;
    /**
     * The AES key for a storage key — derived on first use, then reused. A failed derivation is not kept, so the next
     * call tries again.
     * @protected
     * @param {string} key - The storage key.
     * @returns {Promise<CryptoKey>}
     */
    protected _cryptoKeyFor(key: string): Promise<CryptoKey>;
    /**
     * Encrypt a value
     * @protected
     * @param {any} value - Value to encrypt.
     * @returns {Promise<string|null>} - Encrypted JSON string or null on failure.
     */
    protected _encrypt(key: any, value: any): Promise<string | null>;
    /**
     * Decrypt a previously encrypted value.
     * @protected
     * @param {string} value - Encrypted stringified data.
     * @returns {Promise<any|null>} - Decrypted object or null on failure.
     */
    protected _decrypt(key: any, value: string): Promise<any | null>;
    /**
     * Generate the full namespaced key.
     * @protected
     * @param {string} key - The base key.
     * @returns {string} - The namespaced key.
     */
    protected _fullKey(key: string): string;
    /**
     * Starts the expiration watcher to periodically clear expired keys.
     * @protected
     */
    protected _startExpireWatcher(): void;
    _expireTimer: NodeJS.Timeout;
    /**
     * Cleans up timers and listeners.
     */
    destroy(): void;
    _unloadHandler: any;
    /**
     * List all keys under a specific table prefix.
     * @param {string} tableName - Table prefix.
     * @returns {Promise<string[]>} - List of keys.
     */
    getAll(tableName: string): Promise<string[]>;
    /**
     * Get the expiration timestamp for a key.
     * @param {string} key - Key to check.
     * @returns {Promise<number|null>} - Expiration timestamp or null.
     */
    getExpire(key: string): Promise<number | null>;
    /**
     * Emits a data change event through the communication channel,
     * typically used to notify other tabs, windows, or contexts that
     * a value has been updated.
     *
     * @param {string} key - The key of the updated data.
     * @param {*} value - The new value associated with the key. May be encrypted depending on adapter logic.
     * @param {string} origin - A unique identifier for the source of the change (e.g., tab ID or UUID).
     */
    emitDataChange(key: string, value: any, origin: string): void;
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
    onDataChanged(callback: Function): void;
}
import CrossTabChannel from "../helpers/CrossTabChannel.js";
