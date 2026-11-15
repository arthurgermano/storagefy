export default StoreAdapter;
/**
 * How a store is kept in storage.
 */
export type SetInStorageOptions = {
    /**
     * - State left out of storage (memory only). Dot notation reaches nested keys
     * ("user.password").
     */
    ignoreKeys?: string[];
    /**
     * - Expiration of the stored state, in milliseconds after each write — not a time limit
     * of the operation: after it, the stored state is gone.
     */
    timeout?: number;
    /**
     * - Apply the changes of the other tabs to this store. Needs the storage adapter's
     * channelName and enableSyncTabs.
     */
    syncTabs?: boolean;
    /**
     * - Called when the state could not be saved (the storage is full, the
     * encryption failed…) or a change from another tab could not be read or applied. The store keeps working.
     */
    onError?: (error: Error) => void;
};
/**
 * How a store is loaded from storage.
 */
export type GetFromStorageOptions = {
    /**
     * - Called when a stored state is there but cannot be read (it does not
     * decrypt, it is not JSON…). The store keeps its state.
     */
    onError?: (error: Error) => void;
};
/**
 * What a store adapter's subscription to a store gives.
 */
export type Subscription = {
    /**
     * - Stops listening to the store.
     */
    unsubscribe: () => void;
    /**
     * - The first write of its state (see KeptStore.firstWrite) — resolved when the
     * library tells no state to write before its first change.
     */
    firstWrite: Promise<void>;
};
/**
 * How a store is kept in storage.
 * @typedef {Object} SetInStorageOptions
 * @property {string[]} [ignoreKeys] - State left out of storage (memory only). Dot notation reaches nested keys
 *   ("user.password").
 * @property {number} [timeout] - Expiration of the stored state, in milliseconds after each write — not a time limit
 *   of the operation: after it, the stored state is gone.
 * @property {boolean} [syncTabs] - Apply the changes of the other tabs to this store. Needs the storage adapter's
 *   channelName and enableSyncTabs.
 * @property {(error: Error) => void} [onError] - Called when the state could not be saved (the storage is full, the
 *   encryption failed…) or a change from another tab could not be read or applied. The store keeps working.
 */
/**
 * How a store is loaded from storage.
 * @typedef {Object} GetFromStorageOptions
 * @property {(error: Error) => void} [onError] - Called when a stored state is there but cannot be read (it does not
 *   decrypt, it is not JSON…). The store keeps its state.
 */
/**
 * What a store adapter's subscription to a store gives.
 * @typedef {Object} Subscription
 * @property {() => void} unsubscribe - Stops listening to the store.
 * @property {Promise<void>} firstWrite - The first write of its state (see KeptStore.firstWrite) — resolved when the
 *   library tells no state to write before its first change.
 */
/**
 * Base class of the store adapters (Pinia, React, Svelte): the stores kept, by key (see KeptStore), and how one is
 * loaded and kept. Each adapter adds how its library is checked, read, set and subscribed to.
 *
 * @abstract
 */
declare class StoreAdapter {
    /**
     * @param {import("../adapters/StorageAdapter.js").default} adapter - The storage adapter (IndexedDB, localStorage,
     *   sessionStorage).
     * @throws {Error} If no storage adapter is given.
     */
    constructor(adapter: import("../adapters/StorageAdapter.js").default);
    /** @protected */
    protected adapter: import("../adapters/StorageAdapter.js").default;
    /**
     * The stores kept, by key
     * @private
     * @type {Record<string, KeptStore>}
     */
    private stores;
    /**
     * What getFromStorage loaded under each key (as JSON) and setInStorage has not started from yet
     * @private
     * @type {Map<string, string>}
     */
    private _loaded;
    /**
     * Keeps a store in storage under a key: its state is written now (unless storage already holds it) and on every
     * change after — replacing what was kept under that key before.
     * @param {any} store
     * @param {string} key - Storage key.
     * @param {SetInStorageOptions} [options]
     * @returns {Promise<boolean>} true once the store is subscribed to and its state written (or found stored).
     * @throws {Error} If the store is not one of the adapter's library, or the first write threw — a mistake of the app
     *   (a storage adapter of its own that throws, a state that cannot be copied). A write the storage did not save
     *   (full, encryption unavailable…) throws nothing: it is told through onError, like every write after.
     * @example
     * await piniaAdapter.setInStorage(useUserStore(), "user-data", { ignoreKeys: ["password", "token"] });
     */
    setInStorage(store: any, key: string, options?: SetInStorageOptions): Promise<boolean>;
    /**
     * Makes sure the state of a store is in storage: what the store holds now is written, unless it is stored already,
     * and the answer comes once its writes are done. The store's state is read, not waited for: a change the store has
     * not told yet (Pinia tells a direct change in a later task) is written too — and when it is told, it writes nothing
     * more. Call it before something that must not lose a change, such as signing out.
     *
     * A store whose state cannot be read (a React store without getState nor get, which gives its state to its listeners
     * only) is never written by flush — what is not read is not guessed: its writes in progress are waited for.
     *
     * Before setInStorage of the key is done, flush waits for it first. After destroy, or once the key is kept again, it
     * only waits for the writes in progress.
     * @param {string} [key] - The store's storage key. Without it: every store of this adapter.
     * @returns {Promise<boolean>} true when the state is stored — the one the store held when flush was called, or a
     *   newer one; false when a write was not saved (told through onError). It never rejects for a write.
     * @throws {Error} If no store is kept under key — a mistake of the app.
     * @example
     * userStore.$reset();
     * await piniaAdapter.flush("user-data"); // the cleared state is stored: the page may close
     */
    flush(key?: string): Promise<boolean>;
    /**
     * Loads what storage kept under a key into a store.
     * @param {any} store
     * @param {string} key - Storage key.
     * @param {GetFromStorageOptions} [options]
     * @returns {Promise<true|undefined>} true when a state was loaded; undefined when there was none (or it was not one
     *   the store takes, told through onError).
     * @throws {Error} If the store is not one of the adapter's library, or cannot be set.
     */
    getFromStorage(store: any, key: string, options?: GetFromStorageOptions): Promise<true | undefined>;
    /**
     * Stops keeping the store of a key: no more writes, no more changes from the other tabs. What is stored stays.
     * @param {string} key
     */
    destroy(key: string): void;
    /**
     * Stops keeping every store of this adapter (see destroy). The storage adapter is not destroyed: it may be shared.
     */
    destroyAll(): void;
    /**
     * The state with the keys of ignoreKeys left out (see helpers/state.js omitKeys).
     * @private
     * @param {Object} obj The object to process
     * @param {string[]} ignoreKeys Array of keys to omit. Supports dot-notation for nested keys.
     * @returns {Object} A new object with the specified keys set to undefined (left out of the JSON)
     */
    private omitKeys;
    /**
     * What setInStorage does once the store is kept: reads what storage holds, subscribes to the store and makes its
     * first write.
     * @private
     * @param {any} store
     * @param {string} key
     * @param {KeptStore} kept
     * @returns {Promise<void>} Rejects when the first write threw.
     */
    private _startKeeping;
    /**
     * Starts keeping a store: what was kept under the key before stops (its subscriptions end).
     * @protected
     * @param {string} key
     * @param {any} store
     * @param {SetInStorageOptions} options
     * @returns {KeptStore}
     */
    protected _keep(key: string, store: any, options: SetInStorageOptions): KeptStore;
    /**
     * What getFromStorage loaded under a key, once: for setInStorage to tell whether another tab wrote since.
     * @private
     * @param {string} key
     * @returns {string|undefined} As JSON; undefined when getFromStorage did not load the key.
     */
    private _takeLoaded;
    /**
     * Refuses what is not a store of the adapter's library.
     * @abstract
     * @protected
     * @param {any} store
     * @throws {Error} If it is not one.
     */
    protected _checkStore(store: any): void;
    /**
     * Whether the store's state can be read whenever asked (see _currentOf) — flush writes only a state it read.
     * @protected
     * @param {any} store
     * @returns {boolean}
     */
    protected _canRead(store: any): boolean;
    /**
     * The store's state now.
     * @abstract
     * @protected
     * @param {any} store
     * @returns {any}
     */
    protected _currentOf(store: any): any;
    /**
     * Puts a stored state (another tab's, or what storage holds) on top of the store's, the way its library updates.
     * @abstract
     * @protected
     * @param {any} store
     * @param {any} incoming
     * @throws {Error} If the store does not take it (told through onError).
     */
    protected _apply(store: any, incoming: any): void;
    /**
     * Subscribes to the store: each change is written (KeptStore.changed), and the first write is made as the library
     * allows (KeptStore.firstWrite).
     * @abstract
     * @protected
     * @param {any} store
     * @param {KeptStore} kept
     * @returns {Subscription}
     */
    protected _subscribe(store: any, kept: KeptStore): Subscription;
    /**
     * Sets a state loaded from storage in the store.
     * @abstract
     * @protected
     * @param {any} store
     * @param {string} key
     * @param {any} value - Not null.
     * @param {GetFromStorageOptions} options
     * @returns {boolean} Whether it was set — false when it is not a state the store takes (told through onError).
     * @throws {Error} If the store cannot be set.
     */
    protected _load(store: any, key: string, value: any, options: GetFromStorageOptions): boolean;
}
import KeptStore from "./KeptStore.js";
