import IndexedDBAdapter from "./adapters/IndexedDBAdapter.js";
import LocalStorageAdapter from "./adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "./adapters/SessionStorageAdapter.js";
import PiniaAdapter from "./stores/PiniaAdapter.js";
import ReactAdapter from "./stores/ReactAdapter.js";
import SvelteAdapter from "./stores/SvelteAdapter.js";
/**
 * Initializes and returns a storage adapter instance.
 * @param {Object} config Configuration options
 * @param {string} [config.dbName="storagefy"] Database name
 * @param {string} [config.storeName="storagefy_db"] Store name
 * @param {number} [config.version=1] Database version
 * @param {boolean} [config.encrypt=false] Enable encryption
 * @param {string} [config.password] Secret of the app the encryption key is derived from — without it, anyone who knows
 *   this library can read encrypted values. It ships inside the app, so it only makes reading harder: never store a
 *   token or a password with Storagefy
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
export function startStoragefy(config?: {
    dbName?: string;
    storeName?: string;
    version?: number;
    encrypt?: boolean;
    password?: string;
    channelName?: string | boolean;
    expireCheckInterval?: number;
    description?: string;
    forceRecreate?: boolean;
    fresh?: boolean;
    adapter?: "indexedDB" | "localStorage" | "sessionStorage";
}): IndexedDBAdapter | LocalStorageAdapter | SessionStorageAdapter;
/**
 * Retrieves the current storage adapter instance.
 * @returns {IndexedDBAdapter|LocalStorageAdapter|SessionStorageAdapter} Storage adapter instance
 * @throws {Error} If adapter is not initialized
 */
export function getStorageAdapter(): IndexedDBAdapter | LocalStorageAdapter | SessionStorageAdapter;
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
export function getPiniaAdapter({ adapter, adapterParams, forceRecreate, fresh }?: {
    adapter?: any;
    adapterParams?: any;
    forceRecreate?: boolean;
    fresh?: boolean;
}): {
    setInStorage: Function;
    getFromStorage: Function;
};
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
export function getReactAdapter({ adapter, adapterParams, forceRecreate, fresh }?: {
    adapter?: any;
    adapterParams?: any;
    forceRecreate?: boolean;
    fresh?: boolean;
}): ReactAdapter;
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
export function getSvelteAdapter({ adapter, adapterParams, forceRecreate, fresh }?: {
    adapter?: any;
    adapterParams?: any;
    forceRecreate?: boolean;
    fresh?: boolean;
}): SvelteAdapter;
export function setPiniaStorage(store: any, key: any, options?: {}): Promise<void>;
export function setReactStorage(store: any, key: any, options?: {}): Promise<void>;
export function setSvelteStorage(store: any, key: any, options?: {}): Promise<void>;
export { IndexedDBAdapter, LocalStorageAdapter, SessionStorageAdapter, PiniaAdapter, ReactAdapter, SvelteAdapter };
