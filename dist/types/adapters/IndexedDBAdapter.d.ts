export default IndexedDBAdapter;
/**
 * Class representing an IndexedDB storage adapter.
 * @class IndexedDBAdapter
 * @extends StorageAdapter
 */
declare class IndexedDBAdapter extends StorageAdapter {
    /**
     * Creates an instance of IndexedDBAdapter.
     * @param {Object} config Configuration object
     * @param {string} config.dbName Name of the IndexedDB database
     * @param {string} [config.storeName] Name of the object store (defaults to `${dbName}_store`)
     * @param {number} [config.version=1] Database version
     * @param {boolean} [config.encrypt=false] Whether to encrypt stored data
     * @param {string} [config.password] - Secret of the app the encryption key is derived from (with the storage key as salt). Without it, the key comes from the storage key alone — readable by anyone who knows this library. Ignored when `encrypt` is false.
     * @param {number} [config.expireCheckInterval=1000] Interval for expiration checks in ms
     * @param {string} [config.description=""] Description of the database
     * @param {string} [config.channelName=false] - Optional channel name for cross-tab communication.
     * @param {boolean} [config.enableSyncTabs=false] - Whether to enable sync automatically on change key value
     * @throws {Error} Throws if IndexedDB is not available in the environment
     */
    constructor({ dbName, storeName, version, encrypt, password, expireCheckInterval, channelName, enableSyncTabs, description, }: {
        dbName: string;
        storeName?: string;
        version?: number;
        encrypt?: boolean;
        password?: string;
        expireCheckInterval?: number;
        description?: string;
        channelName?: string;
        enableSyncTabs?: boolean;
    });
    isReady: boolean;
    dbName: string;
    storeName: string;
    encrypt: boolean;
    expireKey: string;
    metaKey: string;
    prefix: string;
    adapterId: string;
    enableSyncTabs: boolean;
    expireCheckInterval: number;
    dbPromise: Promise<any>;
    _unloadHandler: () => void;
    /**
     * Initializes the IndexedDB database.
     * @private
     * @param {Object} params Initialization parameters
     * @param {string} params.dbName Database name
     * @param {number} params.version Database version
     * @param {string} params.description Database description
     * @returns {Promise} Resolves with the database instance when ready
     */
    private _initDB;
    /**
     * Waits for the database to be ready.
     * @async
     * @param {number} [timeout=15] Delay between readiness checks in ms
     * @param {number} [tries=20] Maximum number of readiness checks
     * @returns {Promise<void>} Resolves when database is ready
     * @throws {Error} Throws if database doesn't become ready within the specified attempts
     */
    waitReadiness(timeout?: number, tries?: number): Promise<void>;
    /**
     * Helper method to execute operations within a store transaction.
     * @private
     * @async
     * @param {string} mode Transaction mode ('readonly' or 'readwrite')
     * @param {Function} callback Operation to execute with the store
     * @returns {Promise} Resolves with the callback result
     * @throws {Error} Throws if the operation fails
     */
    private _withStore;
    /**
     * Loads all expiration timestamps.
     * @private
     * @async
     * @returns {Promise<Object>} Object mapping keys to expiration timestamps
     */
    private _loadExpires;
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
    set(key: string, value: any, expire?: number): Promise<boolean>;
    /**
     * Lists all keys with a given prefix and their values.
     * @async
     * @returns {Promise<Array<{key: string, value: *}>>} Array of key-value pairs
     * @example
     * const items = await adapter.list('user_');
     */
    list(): Promise<Array<{
        key: string;
        value: any;
    }>>;
}
import StorageAdapter from "./StorageAdapter.js";
