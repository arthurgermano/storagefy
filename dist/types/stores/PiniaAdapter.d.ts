export default PiniaAdapter;
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
declare class PiniaAdapter extends StoreAdapter {
    /**
     * Creates a PiniaAdapter instance.
     * @param {StoreAdapter} adapter The storage adapter to use for persistence (e.g., IndexedDBAdapter)
     * @throws {Error} Throws if no adapter is provided
     */
    constructor(adapter: StoreAdapter);
    adapter: StoreAdapter;
    stores: {};
    /**
     * Validates that a Pinia store has the required methods.
     * @private
     * @param {Object} store Pinia store instance to validate
     * @throws {Error} Throws if store is invalid or missing required methods
     */
    private _checkStore;
    /**
     * Registers a listener on the adapter to respond to external data changes,
     * ensuring the connected store is synchronized with updates that come
     * from other sources (e.g., different tabs or windows).
     *
     * @private
     * @param {String} key - The key to register the listener for
     */
    private _registerOnDataChanged;
    /**
     * Syncs Pinia store state to persistent storage and sets up subscription for future changes.
     * @async
     * @param {Object} store Pinia store instance
     * @param {string} key Storage key to use
     * @param {Object} [options={}] Configuration options
     * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
     * @param {number} [options.timeout] Operation timeout in milliseconds
     * @param {Function} [options.onError] Called with an Error on every write that fails (storage full, encryption
     *   failure…) — the store keeps working, but its state was not saved
     * @returns {Promise<boolean>} Resolves to true on success
     * @throws {Error} Throws if store is invalid or persistence fails
     * @example
     * // Persist store while ignoring sensitive data
     * await piniaAdapter.setInStorage(useUserStore(), 'user-data', {
     *   ignoreKeys: ['password', 'token'],
     *   timeout: 5000
     * });
     */
    setInStorage(store: any, key: string, options?: {
        ignoreKeys?: string[];
        timeout?: number;
        onError?: Function;
    }): Promise<boolean>;
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
    getFromStorage(store: any, key: string): Promise<boolean>;
}
import StoreAdapter from "./StoreAdapter.js";
