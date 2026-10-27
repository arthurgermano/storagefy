export default LocalStorageAdapter;
/**
 * A storage adapter for `localStorage` that supports encryption, expirations, and metadata.
 * Extends the base `StorageAdapter` class.
 */
declare class LocalStorageAdapter extends StorageAdapter {
    /**
     * @param {Object} options
     * @param {string} options.dbName - The database namespace.
     * @param {number} [options.version=1] - The version of the storage schema.
     * @param {boolean} [options.encrypt=false] - Whether to encrypt stored values.
     * @param {string} [options.password] - Secret of the app the encryption key is derived from (with the storage key as salt). Without it, the key comes from the storage key alone — readable by anyone who knows this library. Ignored when `encrypt` is false.
     * @param {number} [options.expireCheckInterval=1000] - Interval for expiration checks.
     * @param {string} [options.description=""] - Description of the storage instance.
     * @param {string} [options.channelName=false] - Optional channel name for cross-tab communication.
     * @param {boolean} [options.enableSyncTabs=false] - Whether to enable sync automatically on change key value
     * @throws {Error} If `localStorage` is not available.
     */
    constructor({ dbName, version, encrypt, password, expireCheckInterval, description, channelName, enableSyncTabs, }: {
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
     * Initializes metadata for the storage namespace.
     * @private
     * @param {Object} param0
     * @param {string} param0.dbName
     * @param {number} param0.version
     * @param {string} param0.description
     */
    private _initMeta;
    /**
     * Loads expiration metadata from storage.
     * @private
     * @returns {Object} Key-value map of expiration timestamps.
     */
    private _loadExpires;
    /**
     * Stores a value.
     * @param {string} key
     * @param {any} value
     * @param {number} [expire] - Optional expiration in milliseconds from now.
     * @returns {Promise<boolean|null>}
     */
    set(key: string, value: any, expire?: number): Promise<boolean | null>;
    /**
     * Lists all keys and their values for the current prefix.
     * @returns {Promise<Array<{ key: string, value: any }>>}
     */
    list(): Promise<Array<{
        key: string;
        value: any;
    }>>;
}
import StorageAdapter from "./StorageAdapter.js";
