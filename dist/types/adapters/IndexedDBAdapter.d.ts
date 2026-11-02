export default IndexedDBAdapter;
/**
 * @class IndexedDBAdapter
 * @extends StorageAdapter
 */
declare class IndexedDBAdapter extends StorageAdapter {
    /**
     * @param {import("./StorageAdapter.js").StorageAdapterOptions & { storeName?: string }} options - storeName: the
     *   object store (defaults to `${dbName}_store`).
     * @throws {Error} If IndexedDB is not available, or an encryption option is invalid.
     */
    constructor({ dbName, storeName, version, encrypt, password, keyDerivation, expireCheckInterval, channelName, enableSyncTabs, description, }: import("./StorageAdapter.js").StorageAdapterOptions & {
        storeName?: string;
    });
    isReady: boolean;
    dbName: string;
    storeName: string;
    encrypt: boolean;
    expireKey: string;
    metaKey: string;
    revisionKey: string;
    prefix: string;
    adapterId: string;
    enableSyncTabs: boolean;
    expireCheckInterval: number;
    dbPromise: Promise<IDBDatabase>;
    /**
     * Opens the database (creating the object store and the metadata the first time).
     *
     * Never left waiting for good: a database without this adapter's object store is refused with the reason, and a
     * newer version opened by another tab closes this connection (see _closeDB) instead of blocking that tab.
     * @private
     * @returns {Promise<IDBDatabase>}
     * @throws {Error} If the database does not open, or has no object store of this name.
     */
    private _initDB;
    /**
     * Closes the connection for good: every use after it fails with the reason (a write answers false, a read null,
     * both through onError).
     * @private
     * @param {IDBDatabase} db
     * @param {Error} reason - Why it closed.
     */
    private _closeDB;
    /**
     * Waits until the database is open.
     * @param {number} [interval=50] - With tries: how long to wait, interval × (tries + 1) ms.
     * @param {number} [tries=20]
     * @returns {Promise<void>}
     * @throws {Error} Why the database is not open (it was refused, upgraded by another tab, destroyed), or "Database is
     *   not ready" when it is not open in time.
     */
    waitReadiness(interval?: number, tries?: number): Promise<void>;
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
    private _withStore;
    /**
     * The answer of a request, as a promise.
     * @private
     * @param {IDBRequest} request
     * @returns {Promise<any>}
     */
    private _answerOf;
    /**
     * A record of the namespace (expirations, revisions) as stored.
     * @private
     * @param {string|undefined} raw
     * @returns {Object<string, any>}
     */
    private _recordOf;
    /**
     * Loads all expiration timestamps.
     * @private
     * @returns {Promise<Object<string, number>>}
     */
    private _loadExpires;
    /**
     * Changes the expirations in the same transaction as the request that needs it — never read in one transaction
     * and written in another, where two writes at once would lose one of the changes.
     * @private
     * @param {IDBObjectStore} store - The store of the running transaction.
     * @param {(expires: Object<string, number>) => boolean} change - Changes the map; true when something changed.
     * @returns {Promise<void>}
     */
    private _changeExpires;
    /**
     * Changes a record of the namespace (expirations, revisions) in the transaction of the request that needs it.
     * @private
     * @param {IDBObjectStore} store - The store of the running transaction.
     * @param {string} recordKey
     * @param {(record: Object<string, any>) => boolean} change - Changes the record; true when something changed.
     * @returns {Promise<void>}
     */
    private _changeRecord;
    /**
     * Removes the revision of a key, in the transaction that removes the key.
     * @private
     * @param {IDBObjectStore} store - The store of the running transaction.
     * @param {string} key
     * @returns {Promise<void>}
     */
    private _forgetRevision;
    /**
     * Removes a key and its expiration in one transaction, and tells the other tabs.
     * @private
     * @param {string} key
     * @returns {Promise<void>}
     * @throws {Error} If the transaction fails.
     */
    private _deleteNow;
    /**
     * Removes every key of the namespace and the expirations record (and the metadata, when asked), now.
     * @private
     * @param {boolean} withMeta - Remove the metadata too (clear).
     * @returns {Promise<void>}
     */
    private _resetNow;
    /**
     * Removes the entry of a key from a record (expirations, revisions).
     * @private
     * @param {Object<string, any>} record
     * @param {string} key
     * @returns {boolean} Whether the key had one.
     */
    private _removeEntry;
}
import StorageAdapter from "./StorageAdapter.js";
