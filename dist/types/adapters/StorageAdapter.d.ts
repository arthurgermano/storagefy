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
 * The order of a write among every write of a key, in every tab of the app: a store applies another tab's state only
 * when it is newer than the one it holds — an older message, or a stale state written late, never undoes a newer one.
 * @typedef {Object} Revision
 * @property {number} at - When it was written (ms since the epoch) — or, when the clock gives no later time than the
 *   newest revision of the key known, one more than it: the revisions of a key always rise.
 * @property {string} by - The adapter that wrote it: of two writes at the same `at`, the one with the greater `by` is
 *   the newer, in every tab alike.
 */
/**
 * The revision of a new write, and the newest revision of the key known when it was made.
 * @typedef {Object} NextRevision
 * @property {Revision} revision
 * @property {Revision} [basis] - None when no revision of the key was known (stored or told).
 */
/**
 * What is stored under a key, with the order of its write.
 * @typedef {Object} StoredRead
 * @property {any} value - The value, or null when absent, expired or unreadable.
 * @property {Revision} [revision] - The revision of the value; none for a value written before 1.4.0, or none stored.
 */
/**
 * Whether a value is a revision (see Revision) — a record or a message may hold anything.
 * @param {unknown} value
 * @returns {value is Revision}
 */
export function isRevision(value: unknown): value is Revision;
/**
 * Whether a revision is newer than another: a later `at`, or the same `at` and a greater `by`. Nothing is older than
 * any revision.
 * @param {Revision} revision
 * @param {Revision} [than]
 * @returns {boolean}
 */
export function isNewerRevision(revision: Revision, than?: Revision): boolean;
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
    /**
     * - The order of the write ("set"); a message of 1.3.x has none.
     */
    revision?: Revision;
};
/**
 * The order of a write among every write of a key, in every tab of the app: a store applies another tab's state only
 * when it is newer than the one it holds — an older message, or a stale state written late, never undoes a newer one.
 */
export type Revision = {
    /**
     * - When it was written (ms since the epoch) — or, when the clock gives no later time than the
     * newest revision of the key known, one more than it: the revisions of a key always rise.
     */
    at: number;
    /**
     * - The adapter that wrote it: of two writes at the same `at`, the one with the greater `by` is
     * the newer, in every tab alike.
     */
    by: string;
};
/**
 * The revision of a new write, and the newest revision of the key known when it was made.
 */
export type NextRevision = {
    revision: Revision;
    /**
     * - None when no revision of the key was known (stored or told).
     */
    basis?: Revision;
};
/**
 * What is stored under a key, with the order of its write.
 */
export type StoredRead = {
    /**
     * - The value, or null when absent, expired or unreadable.
     */
    value: any;
    /**
     * - The revision of the value; none for a value written before 1.4.0, or none stored.
     */
    revision?: Revision;
};
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
    /** @type {Map<string, Revision>} */
    _revisions: Map<string, Revision>;
    /** @type {Map<string, NextRevision>} */
    _written: Map<string, NextRevision>;
    /** Whether the tabs of the app share the storage (IndexedDB, localStorage): a tab can read what another wrote */
    sharedBetweenTabs: boolean;
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
     * What is stored under a key, with its revision — after the writes of the key asked before.
     * @abstract
     * @protected
     * @param {string} key - The storage key.
     * @param {ReadOptions} [options]
     * @returns {Promise<StoredRead>} Never rejects: a value that cannot be read is null, told through onError.
     */
    protected _read(key: string, options?: ReadOptions): Promise<StoredRead>;
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
     * Knows a revision of a key — written here or told by another tab — when it is newer than the one known.
     * @protected
     * @param {string} key - The storage key.
     * @param {unknown} revision - Anything that is not a revision is left out.
     */
    protected _noteRevision(key: string, revision: unknown): void;
    /**
     * The revision of a new write of a key: newer than the one stored and than every one known.
     * @protected
     * @param {string} key - The storage key.
     * @param {unknown} stored - The revision stored with the key now (read with the write, so no write lands between).
     * @returns {NextRevision}
     */
    protected _nextRevision(key: string, stored: unknown): NextRevision;
    /**
     * Keeps the revision of a write saved here, and what it was written after.
     * @protected
     * @param {string} key - The storage key.
     * @param {NextRevision} next - As _nextRevision gave it.
     */
    protected _wrote(key: string, next: NextRevision): void;
    /**
     * The revision of the last write of a key saved by this adapter.
     * @protected
     * @param {string} key - The storage key.
     * @returns {Revision|undefined}
     */
    protected _writtenRevision(key: string): Revision | undefined;
    /**
     * The newest revision of a key known when this adapter saved its last write of it — none when it knew none. A write
     * of another tab newer than it was not known: made at the same time, it may have landed after this one.
     * @protected
     * @param {string} key - The storage key.
     * @returns {Revision|undefined}
     */
    protected _writtenAfter(key: string): Revision | undefined;
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
     * Calls back when a write of another tab reaches what this tab reads of a key — after its message, at times (see
     * WebStorageAdapter). None here: IndexedDB tells a write once its transaction is saved, and a read after the message
     * sees it.
     * @protected
     * @param {string} key - The storage key.
     * @param {() => void} callback
     * @returns {() => void} Stops it.
     */
    protected _onStoredChange(key: string, callback: () => void): () => void;
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
     * Whether a key is one of the namespace's own records (metadata, expirations, revisions) — never a key of the app.
     * @private
     * @param {string} key
     * @returns {boolean}
     */
    private _isRecord;
    /**
     * The revision stored for a key, in the revisions record (keyed by the stored key, so an encrypted namespace shows
     * no key name).
     * @protected
     * @param {Object<string, unknown>} revisions - The revisions record.
     * @param {string} key - The storage key.
     * @returns {Revision|undefined}
     */
    protected _revisionIn(revisions: {
        [x: string]: unknown;
    }, key: string): Revision | undefined;
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
     * @param {Revision} [revision] - The revision of the write.
     */
    emitDataChange(key: string, value: string | undefined, origin: string, revision?: Revision): void;
    /**
     * Listens for the changes other tabs tell.
     * @param {(change: DataChange) => void} callback
     * @returns {() => void} Stops listening (does nothing without a channel).
     */
    onDataChanged(callback: (change: DataChange) => void): () => void;
}
import CrossTabChannel from "../helpers/CrossTabChannel.js";
