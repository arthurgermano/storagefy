/**
 * Where a store adapter takes its storage adapter from.
 */
export type FrameworkAdapterOptions = {
    /**
     * - A storage adapter you created.
     */
    adapter?: import("./adapters/StorageAdapter.js").default;
    /**
     * - Or the options of a new one.
     */
    adapterParams?: Parameters<typeof startStoragefy>[0];
    /**
     * - Create a new store adapter instead of the one kept — whose stores stop
     * being kept (keep them again with the new one).
     */
    forceRecreate?: boolean;
    /**
     * - Return a new store adapter and keep the one kept as it is.
     */
    fresh?: boolean;
};
export type StorageAdapterOptions = import("./adapters/StorageAdapter.js").StorageAdapterOptions;
export type ReadOptions = import("./adapters/StorageAdapter.js").ReadOptions;
export type DataChange = import("./adapters/StorageAdapter.js").DataChange;
export type SetInStorageOptions = import("./stores/StoreAdapter.js").SetInStorageOptions;
export type GetFromStorageOptions = import("./stores/StoreAdapter.js").GetFromStorageOptions;
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
 * @param {boolean} [config.encrypt=false] Enable encryption — it makes the values hard to read in the browser; it does
 *   not keep a secret: never store a token or a password with Storagefy
 * @param {string} [config.password] Secret of the app the encryption keys are derived from — without it, a key is
 *   derived from the storage key's own name
 * @param {"hkdf"|"pbkdf2"} [config.keyDerivation="hkdf"] How the keys are derived from the password: "hkdf" (fast)
 *   when the password is a constant of the app; "pbkdf2" (slow on purpose) only when the person types it
 * @param {string|false} [config.channelName=false] Channel name for storage communication between tabs
 * @param {boolean} [config.enableSyncTabs=false] Tell the other tabs about every write (needs channelName; each store
 *   also asks for it with syncTabs)
 * @param {number} [config.expireCheckInterval=1000] Expiration check interval (ms); 0 turns it off
 * @param {string} [config.description="Storagefy database"] Database description
 * @param {boolean} [config.forceRecreate=false] Replace the adapter kept with a new one: the old one is destroyed, and
 *   the store adapters kept over it stop keeping their stores (keep them again)
 * @param {boolean} [config.fresh=false] Return a new adapter, kept by nobody — the adapter kept (if any) stays as it
 *   is
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
    keyDerivation?: "hkdf" | "pbkdf2";
    channelName?: string | false;
    enableSyncTabs?: boolean;
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
 * Gets a Pinia store adapter's methods.
 * @param {FrameworkAdapterOptions} [options]
 * @returns {{ setInStorage: PiniaAdapter["setInStorage"], getFromStorage: PiniaAdapter["getFromStorage"] }} The
 *   methods of the adapter kept — or, with `fresh`, a new adapter (it has the same methods).
 * @throws {Error} If no storage adapter was given or started.
 */
export function getPiniaAdapter(options?: FrameworkAdapterOptions): {
    setInStorage: PiniaAdapter["setInStorage"];
    getFromStorage: PiniaAdapter["getFromStorage"];
};
/**
 * Gets a React store adapter.
 * @param {FrameworkAdapterOptions} [options]
 * @returns {ReactAdapter} The adapter kept — or, with `fresh`, a new one.
 * @throws {Error} If no storage adapter was given or started.
 */
export function getReactAdapter(options?: FrameworkAdapterOptions): ReactAdapter;
/**
 * Gets a Svelte store adapter.
 * @param {FrameworkAdapterOptions} [options]
 * @returns {SvelteAdapter} The adapter kept — or, with `fresh`, a new one.
 * @throws {Error} If no storage adapter was given or started.
 */
export function getSvelteAdapter(options?: FrameworkAdapterOptions): SvelteAdapter;
/**
 * Loads a Pinia store from storage, then keeps every change there — with the Pinia adapter kept (created over the
 * storage startStoragefy created, the first time).
 * @param {any} store - The Pinia store.
 * @param {string} key - Storage key.
 * @param {import("./stores/StoreAdapter.js").SetInStorageOptions} [options]
 * @returns {Promise<void>}
 * @throws {Error} If the store or the key is missing, or no storage adapter was started.
 */
export function setPiniaStorage(store: any, key: string, options?: import("./stores/StoreAdapter.js").SetInStorageOptions): Promise<void>;
/**
 * Loads a React store (Redux, Zustand…) from storage, then keeps every change there — with the React adapter kept.
 * @param {any} store - The store.
 * @param {string} key - Storage key.
 * @param {import("./stores/StoreAdapter.js").SetInStorageOptions} [options]
 * @returns {Promise<void>}
 * @throws {Error} If the store or the key is missing, or no storage adapter was started.
 */
export function setReactStorage(store: any, key: string, options?: import("./stores/StoreAdapter.js").SetInStorageOptions): Promise<void>;
/**
 * Loads a Svelte writable store from storage, then keeps every change there — with the Svelte adapter kept.
 * @param {any} store - The writable store.
 * @param {string} key - Storage key.
 * @param {import("./stores/StoreAdapter.js").SetInStorageOptions} [options]
 * @returns {Promise<void>}
 * @throws {Error} If the store or the key is missing, or no storage adapter was started.
 */
export function setSvelteStorage(store: any, key: string, options?: import("./stores/StoreAdapter.js").SetInStorageOptions): Promise<void>;
export { IndexedDBAdapter, LocalStorageAdapter, SessionStorageAdapter, PiniaAdapter, ReactAdapter, SvelteAdapter };
