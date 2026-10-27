export default SvelteAdapter;
/**
 * Svelte store adapter that syncs Svelte writable stores with persistent storage.
 * Provides seamless integration between Svelte's store contract and various storage backends.
 * @class SvelteAdapter
 * @extends StoreAdapter
 * @example
 * // Basic usage with a Svelte writable store
 * import { writable } from 'svelte/store';
 * import { IndexedDBAdapter } from 'storagefy';
 *
 * const userStore = writable({});
 * const svelteAdapter = new SvelteAdapter(new IndexedDBAdapter({ dbName: 'svelte-app' }));
 *
 * // Persist store state
 * await svelteAdapter.setInStorage(userStore, 'user-data');
 *
 * // Hydrate store from storage
 * await svelteAdapter.getFromStorage(userStore, 'user-data');
 */
declare class SvelteAdapter extends StoreAdapter {
    /**
     * Creates a SvelteAdapter instance.
     * @param {StoreAdapter} adapter The storage adapter to use for persistence (IndexedDB, LocalStorage, etc.)
     * @throws {Error} Throws if no adapter is provided
     */
    constructor(adapter: StoreAdapter);
    adapter: StoreAdapter;
    stores: {};
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
     * Syncs a Svelte store to persistent storage and sets up subscription for future changes.
     * @async
     * @param {Object} store Svelte writable store instance
     * @param {string} key Storage key to use
     * @param {Object} [options={}] Configuration options
     * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
     * @param {number} [options.timeout] Operation timeout in milliseconds
     * @param {Function} [options.onError] Called with an Error on every write that fails (storage full, encryption
     *   failure…) — the store keeps working, but its state was not saved
     * @returns {Promise<boolean>} Resolves to true when initial sync completes
     * @throws {Error} Throws if store is invalid or persistence fails
     * @example
     * // Persist store while ignoring sensitive fields
     * await svelteAdapter.setInStorage(userStore, 'user-profile', {
     *   ignoreKeys: ['password', 'token'],
     *   timeout: 2000
     * });
     */
    setInStorage(store: any, key: string, options?: {
        ignoreKeys?: string[];
        timeout?: number;
        onError?: Function;
    }): Promise<boolean>;
    /**
     * Hydrates a Svelte store from persistent storage.
     * @async
     * @param {Object} store Svelte writable store instance to hydrate
     * @param {string} key Storage key to load from
     * @returns {Promise<boolean>} Resolves to true on success, undefined if no data found
     * @throws {Error} Throws if store is invalid or update fails
     * @example
     * // Load persisted state into store
     * await svelteAdapter.getFromStorage(userStore, 'user-profile');
     */
    getFromStorage(store: any, key: string): Promise<boolean>;
    /**
     * Validates that a store conforms to Svelte's writable store contract.
     * @private
     * @param {Object} store Store instance to validate
     * @throws {Error} Throws if store doesn't have required subscribe and set methods
     */
    private _checkStore;
}
import StoreAdapter from "./StoreAdapter.js";
