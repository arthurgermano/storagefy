export default ReactAdapter;
/**
 * React state persistence adapter that syncs React state management stores with a storage backend.
 * Supports Redux, Zustand, and other React state management libraries with compatible interfaces.
 * @class ReactAdapter
 * @extends StoreAdapter
 * @example
 * // Basic usage with Redux and IndexedDB
 * const reduxAdapter = new ReactAdapter(new IndexedDBAdapter({ dbName: 'app-state' }));
 * await reduxAdapter.setInStorage(store, 'redux-state');
 * await reduxAdapter.getFromStorage(store, 'redux-state');
 *
 * // Usage with Zustand
 * const zustandAdapter = new ReactAdapter(new LocalStorageAdapter());
 * await zustandAdapter.setInStorage(useStore, 'zustand-state');
 */
declare class ReactAdapter extends StoreAdapter {
    /**
     * Creates a ReactAdapter instance.
     * @param {StoreAdapter} adapter The storage adapter to use for persistence (IndexedDB, LocalStorage, etc.)
     * @throws {Error} Throws if no adapter is provided
     */
    constructor(adapter: StoreAdapter);
    adapter: StoreAdapter;
    stores: {};
    _getPayload(current: any, payload: any): any;
    /**
     * Registers a listener on the adapter to respond to external data changes,
     * ensuring the connected store is synchronized with updates that come
     * from other sources (e.g., different tabs or windows).
     *
     * @private
     * @param {Object} store - A reactive store (e.g., a Redux, Jotai, Zustand or Custom store) that will be updated when external changes occur.
     */
    private _registerOnDataChanged;
    /**
     * Syncs React store state to persistent storage and sets up subscription for future changes.
     * Supports both Redux-style (getState/subscribe) and Zustand-style stores.
     * @async
     * @param {Object} store React state store instance (Redux, Zustand, etc.)
     * @param {string} key Storage key to use
     * @param {Object} [options={}] Configuration options
     * @param {string[]} [options.ignoreKeys=[]] Keys to exclude from persistence
     * @param {number} [options.timeout] Operation timeout in milliseconds
     * @param {Function} [options.onError] Called with an Error on every write that fails (storage full, encryption
     *   failure…) — the store keeps working, but its state was not saved
     * @returns {Promise<boolean>} Resolves to true when subscription is established
     * @throws {Error} Throws if store is invalid or unsupported
     * @example
     * // Persist Redux store while ignoring sensitive data
     * await reactAdapter.setInStorage(reduxStore, 'user-state', {
     *   ignoreKeys: ['authToken', 'password'],
     *   timeout: 3000
     * });
     *
     * // Persist Zustand store
     * await reactAdapter.setInStorage(zustandStore, 'app-settings');
     */
    setInStorage(store: any, key: string, options?: {
        ignoreKeys?: string[];
        timeout?: number;
        onError?: Function;
    }): Promise<boolean>;
    /**
     * Hydrates a React store from persistent storage.
     * Supports both Redux (dispatch) and Zustand (setState) update patterns.
     * @async
     * @param {Object} store React state store instance to hydrate
     * @param {string} key Storage key to load from
     * @returns {Promise<boolean>} Resolves to true on success, undefined if no data found
     * @throws {Error} Throws if store is invalid or update fails
     * @example
     * // Hydrate Redux store
     * await reactAdapter.getFromStorage(reduxStore, 'user-state');
     *
     * // Hydrate Zustand store
     * await reactAdapter.getFromStorage(zustandStore, 'app-settings');
     */
    getFromStorage(store: any, key: string): Promise<boolean>;
    /**
     * Validates that a store has the required interface methods.
     * @private
     * @param {Object} store Store instance to validate
     * @throws {Error} Throws if store is invalid or missing required methods
     */
    private _checkStore;
}
import StoreAdapter from "./StoreAdapter.js";
