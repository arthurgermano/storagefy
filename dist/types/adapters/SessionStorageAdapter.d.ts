export default SessionStorageAdapter;
/**
 * @class SessionStorageAdapter
 * @extends StorageAdapter
 * Adapter for browser sessionStorage with optional encryption and expiration support.
 */
declare class SessionStorageAdapter extends StorageAdapter {
    /**
     * @constructor
     * @param {Object} options
     * @param {string} options.dbName - The namespace for storage keys.
     * @param {number} [options.version=1] - Schema version of the storage.
     * @param {boolean} [options.encrypt=false] - Whether to encrypt stored values.
     * @param {string} [options.password] - Secret of the app the encryption key is derived from (with the storage key as salt). Without it, the key comes from the storage key alone — readable by anyone who knows this library. Ignored when `encrypt` is false.
     * @param {number} [options.expireCheckInterval=1000] - Interval to check for expired items (ms).
     * @param {string} [options.description=""] - Optional description metadata.
     * @param {string} [options.channelName=false] - Optional channel name for cross-tab communication.
     * @param {boolean} [options.enableSyncTabs=false] - Whether to enable sync automatically on change key value
     * @throws Will throw if sessionStorage is not available.
     */
    constructor({ dbName, version, encrypt, password, expireCheckInterval, channelName, description, enableSyncTabs, }: {
        dbName: string;
        version?: number;
        encrypt?: boolean;
        password?: string;
        expireCheckInterval?: number;
        description?: string;
        channelName?: string;
        enableSyncTabs?: boolean;
    });
    dbName: string;
    encrypt: boolean;
    expireKey: string;
    metaKey: string;
    prefix: string;
    adapterId: string;
    expireCheckInterval: number;
    enableSyncTabs: boolean;
    _unloadHandler: () => void;
    /**
     * Initializes metadata for the current storage instance.
     * @private
     * @param {Object} meta
     * @param {string} meta.dbName
     * @param {number} meta.version
     * @param {string} meta.description
     */
    private _initMeta;
    /**
     * Loads expiration map from sessionStorage.
     * @private
     * @returns {Object<string, number>}
     */
    private _loadExpires;
    /**
     * Stores a value, with optional expiration.
     * @param {string} key
     * @param {any} value
     * @param {number} [expire] - Time in ms until expiration.
     * @returns {Promise<boolean|null>}
     */
    set(key: string, value: any, expire?: number): Promise<boolean | null>;
    /**
     * Lists all stored key-value pairs under a prefix.
     * @returns {Promise<Array<{key: string, value: any}>>}
     */
    list(): Promise<Array<{
        key: string;
        value: any;
    }>>;
}
import StorageAdapter from "./StorageAdapter.js";
