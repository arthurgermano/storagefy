export default StorageAdapter;
/**
 * Options shared by every storage adapter.
 */
export type StorageAdapterOptions = {
    /**
     * - Namespace of the keys (the database name, for IndexedDB).
     */
    dbName: string;
    /**
     * - Version of the stored schema.
     */
    version?: number;
    /**
     * - Encrypt the values (AES-GCM) and obfuscate the key names. It makes reading
     * them in the browser harder; it does not keep a secret — never store a token or a password.
     */
    encrypt?: boolean;
    /**
     * - The app's secret the encryption keys are derived from (only with `encrypt`).
     * Without it, a key is derived from the storage key's own name.
     */
    password?: string;
    /**
     * - How a key is derived from the password: "hkdf" (fast) when the
     * password is a constant of the app; "pbkdf2" (slow on purpose) only when the person types it. Values are read
     * the way they were written, whatever this option is now.
     */
    keyDerivation?: "hkdf" | "pbkdf2";
    /**
     * - How often (ms) expired keys are removed; 0 turns the watcher off.
     */
    expireCheckInterval?: number;
    /**
     * - Description kept with the metadata.
     */
    description?: string;
    /**
     * - Name of the BroadcastChannel the tabs of the app talk on.
     */
    channelName?: string | false;
    /**
     * - Tell the other tabs about every write and delete (needs channelName).
     */
    enableSyncTabs?: boolean;
};
/**
 * Options of a read.
 */
export type ReadOptions = {
    /**
     * - Called when a value is there but cannot be read (it does not
     * decrypt, it is not JSON, the storage failed). The read still answers null.
     */
    onError?: (error: Error) => void;
};
/**
 * A change told by another tab.
 */
export type DataChange = {
    /**
     * - The adapter that wrote it.
     */
    adapterId: string;
    /**
     * - The namespace of the key: a store follows only the changes of its own namespace, so apps
     * (or parts of one) that share a channel name do not mix their states.
     */
    dbName: string;
    /**
     * - The storage key.
     */
    key: string;
    /**
     * - The stored value (localStorage and sessionStorage; IndexedDB is read again).
     */
    value?: string;
    /**
     * - What happened ("set", "delete", "reset").
     */
    origin: string;
};
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
 */
/**
 * @class StorageAdapter
 * @abstract
 * Base class of the storage adapters: encryption, the order of writes and the channel between tabs.
 */
declare class StorageAdapter {
    /**
     * @param {string|false} [channelName] - Name of the channel between tabs; without it, nothing is told to other tabs.
     */
    constructor(channelName?: string | false);
    _derivedKeys: Map<any, any>;
    _pendingWrites: Map<any, any>;
    _barrier: Promise<void>;
    keyDerivation: string;
    /** @type {ReturnType<typeof setInterval> | null} The expiry watcher (the browser's and Node's timers differ) */
    _expireTimer: ReturnType<typeof setInterval> | null;
    channelName: string;
    channel: CrossTabChannel;
    /**
     * Retrieve the value for a given key — after the writes of the key asked before.
     * @abstract
     * @param {string} key - The storage key.
     * @param {ReadOptions} [options]
     * @returns {Promise<any>} The value, or null when absent, expired or unreadable.
     */
    get(key: string, options?: ReadOptions): Promise<any>;
    /**
     * Store a value under a key. Writes of the same key are applied in the order they were called.
     * @abstract
     * @param {string} key - The storage key.
     * @param {any} value - The value to store (JSON); null or undefined removes the key.
     * @param {number} [expire] - Expiration in milliseconds from now.
     * @returns {Promise<boolean|null>} true when stored, false when it failed, null when the key was removed.
     */
    set(key: string, value: any, expire?: number): Promise<boolean | null>;
    /**
     * Delete a specific key.
     * @abstract
     * @param {string} key - The storage key to remove.
     * @returns {Promise<void>}
     */
    delete(key: string): Promise<void>;
    /**
     * The keys and values whose key starts with a prefix.
     * @abstract
     * @param {string} [prefix=""] - Prefix of the keys (without the namespace).
     * @returns {Promise<Array<{ key: string, value: any }>>}
     */
    list(prefix?: string): Promise<Array<{
        key: string;
        value: any;
    }>>;
    /**
     * Remove every key of the namespace (the metadata stays).
     * @abstract
     * @returns {Promise<void>}
     */
    reset(): Promise<void>;
    /**
     * Remove every key of the namespace and its metadata.
     * @abstract
     * @returns {Promise<void>}
     */
    clear(): Promise<void>;
    /**
     * Remove all expired keys.
     * @abstract
     * @returns {Promise<void>}
     */
    clearExpire(): Promise<void>;
    /**
     * Set the expiration time of a key.
     * @abstract
     * @param {string} key - Key to expire.
     * @param {number} time - Expiration timestamp in ms.
     * @returns {Promise<void>}
     */
    setExpire(key: string, time: number): Promise<void>;
    /**
     * Remove the expiration of a key.
     * @abstract
     * @param {string} key - Key to remove expiration from.
     * @returns {Promise<void>}
     */
    deleteExpire(key: string): Promise<void>;
    /**
     * Check if a key is stored and not expired — whether get would find a value.
     * @abstract
     * @param {string} key - Key to check.
     * @returns {Promise<boolean>}
     */
    has(key: string): Promise<boolean>;
    /**
     * Keeps the encryption options (see StorageAdapterOptions).
     * @protected
     * @param {string|null|undefined} password - A non-empty string, or nothing.
     * @param {unknown} [keyDerivation] - "hkdf" or "pbkdf2"; nothing means "hkdf".
     * @throws {Error} If a password is given that is not a non-empty string, or the key derivation is unknown.
     */
    protected _setEncryption(password: string | null | undefined, keyDerivation?: unknown): void;
    password: string;
    /**
     * Runs a write of a key after the writes of that key asked before it — the encryption before a write is
     * asynchronous, and two writes in a row could otherwise land in the reverse order, leaving the older value stored.
     * @protected
     * @template T
     * @param {string} key - The storage key.
     * @param {() => Promise<T>} write - The write (the adapters answer false instead of throwing).
     * @returns {Promise<T>}
     */
    protected _inOrder<T>(key: string, write: () => Promise<T>): Promise<T>;
    /**
     * Runs an operation on every key of the namespace (reset, clear) after every write asked before it — the writes asked
     * after it wait for it. Without it, a write asked before a reset could land after it and survive the reset.
     * @protected
     * @template T
     * @param {() => Promise<T>} operation - The operation (the adapters log instead of throwing).
     * @returns {Promise<T>}
     */
    protected _exclusive<T>(operation: () => Promise<T>): Promise<T>;
    /**
     * Waits for the writes of a key and the operations on every key asked so far — a read after a write sees it, even
     * when the write was not awaited. Never rejects. Nothing inside a write reads (it would wait for itself).
     * @protected
     * @param {string} key - The storage key.
     * @returns {Promise<void>}
     */
    protected _afterWrites(key: string): Promise<void>;
    /**
     * Removes a key found expired — in the key's queue, and only if it is still expired when its turn comes: a write
     * asked in the meantime (with a new expiration, or none) wins over the expiration seen before it.
     * @abstract
     * @protected
     * @param {string} key - The storage key.
     * @returns {Promise<void>} Never rejects.
     */
    protected _expire(key: string): Promise<void>;
    /**
     * The AES key of a storage key for a key derivation — derived on first use, then reused. A failed derivation is not
     * kept, so the next call tries again.
     * @protected
     * @param {string} key - The storage key.
     * @param {"hkdf"|"pbkdf2"} keyDerivation
     * @returns {Promise<CryptoKey>}
     */
    protected _cryptoKeyFor(key: string, keyDerivation: "hkdf" | "pbkdf2"): Promise<CryptoKey>;
    /**
     * The text to store for a value already turned into JSON — encrypted when the adapter encrypts.
     * @protected
     * @param {string} key - The storage key.
     * @param {string} json - The value, as JSON.
     * @returns {Promise<string|null>} What to store, or null when encryption failed.
     */
    protected _encrypt(key: string, json: string): Promise<string | null>;
    /**
     * The value of a stored text — decrypted the way it was written (1.3.0 format or 1.2.x).
     * @protected
     * @param {string} key - The storage key.
     * @param {string} stored - What was stored.
     * @returns {Promise<any>}
     * @throws {Error} If it is not JSON, does not decrypt or names an unknown key derivation.
     */
    protected _decrypt(key: string, stored: string): Promise<any>;
    /**
     * Tells a read that failed (see ReadOptions).
     * @protected
     * @param {string} key - The storage key.
     * @param {ReadOptions|undefined} options
     * @param {unknown} cause
     */
    protected _reportReadFailure(key: string, options: ReadOptions | undefined, cause: unknown): void;
    /**
     * Generate the full namespaced key (obfuscated when encrypting).
     * @protected
     * @param {string} key - The base key.
     * @returns {string}
     */
    protected _fullKey(key: string): string;
    /**
     * The key without the namespace, when a stored key belongs to this adapter (and to the prefix asked).
     * @protected
     * @param {string} storedKey - A key as stored (obfuscated when encrypting).
     * @param {string} [prefix=""] - Prefix of the keys asked for.
     * @returns {string|null}
     */
    protected _ownKey(storedKey: string, prefix?: string): string | null;
    /**
     * The keys and values of a table (the keys that start with `${tableName}__`) — every key of the namespace when no
     * table is given.
     * @param {string} [tableName] - Table prefix.
     * @returns {Promise<Array<{ key: string, value: any }>>}
     */
    getAll(tableName?: string): Promise<Array<{
        key: string;
        value: any;
    }>>;
    /**
     * Get the expiration timestamp for a key.
     * @param {string} key - Key to check.
     * @returns {Promise<number|null>} - Expiration timestamp or null.
     */
    getExpire(key: string): Promise<number | null>;
    /**
     * Whether an expiration timestamp has passed — the rule of get and has: a key without one never expires.
     * @protected
     * @param {number|undefined} expiresAt - The key's expiration timestamp (ms since the epoch).
     * @returns {boolean}
     */
    protected _isExpired(expiresAt: number | undefined): boolean;
    /**
     * Starts the expiration watcher to periodically clear expired keys.
     * @protected
     */
    protected _startExpireWatcher(): void;
    /**
     * Releases the adapter, once the writes already asked are done: stops the expiry watcher and closes the channel
     * between tabs (IndexedDB also closes its connection). Call it when the adapter is no longer used — it is not used
     * after.
     * @returns {Promise<void>}
     */
    destroy(): Promise<void>;
    /**
     * Tells the other tabs about a change (when a channel is open).
     * @param {string} key - The key that changed.
     * @param {string|undefined} value - The stored value, when it goes with the message (localStorage, sessionStorage).
     * @param {string} origin - What happened.
     */
    emitDataChange(key: string, value: string | undefined, origin: string): void;
    /**
     * Listens for the changes other tabs tell.
     * @param {(change: DataChange) => void} callback
     * @returns {() => void} Stops listening (does nothing without a channel).
     */
    onDataChanged(callback: (change: DataChange) => void): () => void;
}
import CrossTabChannel from "../helpers/CrossTabChannel.js";
