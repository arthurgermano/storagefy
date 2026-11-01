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
 * A store kept in storage.
 * @typedef {Object} KeptStore
 * @property {string} key
 * @property {any} store
 * @property {SetInStorageOptions & { ignoreKeys: string[] }} options
 * @property {(() => void) | null} unsubscribe - Stops listening to the store.
 * @property {(() => void) | null} stopTabs - Stops listening to the other tabs.
 * @property {any} latest - The newest state not written yet (undefined: none).
 * @property {Promise<void> | null} writing - The write in progress.
 * @property {boolean} applying - True while another tab's state is put in the store: that change is not written back.
 * @property {Promise<void>} incoming - The changes of the other tabs, applied one after another.
 */
/**
 * Whether a value is a plain object (not null, not an array) — the state merged with another tab's; anything else
 * (an array, a number, a string, a boolean) is replaced whole.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isPlainObject(value: unknown): value is Record<string, any>;
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
 * A store kept in storage.
 */
export type KeptStore = {
    key: string;
    store: any;
    options: SetInStorageOptions & {
        ignoreKeys: string[];
    };
    /**
     * - Stops listening to the store.
     */
    unsubscribe: (() => void) | null;
    /**
     * - Stops listening to the other tabs.
     */
    stopTabs: (() => void) | null;
    /**
     * - The newest state not written yet (undefined: none).
     */
    latest: any;
    /**
     * - The write in progress.
     */
    writing: Promise<void> | null;
    /**
     * - True while another tab's state is put in the store: that change is not written back.
     */
    applying: boolean;
    /**
     * - The changes of the other tabs, applied one after another.
     */
    incoming: Promise<void>;
};
/**
 * Base class of the store adapters (Pinia, React, Svelte): which stores are kept, their writes and the changes of the
 * other tabs. Each adapter adds how its library is read, written and subscribed to.
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
    adapter: import("../adapters/StorageAdapter.js").default;
    /** @type {Record<string, KeptStore>} */
    stores: Record<string, KeptStore>;
    /**
     * Keeps a store in storage under a key and every change after — replacing what was kept under that key before.
     * @abstract
     * @param {any} store
     * @param {string} key
     * @param {SetInStorageOptions} [options]
     * @returns {Promise<boolean>}
     */
    setInStorage(store: any, key: string, options?: SetInStorageOptions): Promise<boolean>;
    /**
     * Loads what storage kept under a key into a store.
     * @abstract
     * @param {any} store
     * @param {string} key
     * @param {GetFromStorageOptions} [options]
     * @returns {Promise<true|undefined>} true when a state was loaded; undefined when there was none.
     */
    getFromStorage(store: any, key: string, options?: GetFromStorageOptions): Promise<true | undefined>;
    /**
     * Starts keeping a store: what was kept under the key before stops (its subscriptions end).
     * @protected
     * @param {string} key
     * @param {any} store
     * @param {SetInStorageOptions} options - Not changed: the adapter keeps its own copy.
     * @returns {KeptStore}
     */
    protected _keep(key: string, store: any, options: SetInStorageOptions): KeptStore;
    /**
     * A change of a kept store, as its subscription hears it: written — unless it is another tab's state being applied
     * (it is not written back). A null or undefined state removes the stored key (a store emptied on sign-out is not
     * loaded back), as the storage adapters' set does; 0, false and "" are written as they are.
     *
     * The state given must be the store's own (read from it): a store adapter never passes a guess.
     * @protected
     * @param {KeptStore} kept
     * @param {any} state
     * @returns {Promise<void> | null} The write (see _persist), or null when nothing is written.
     */
    protected _onChange(kept: KeptStore, state: any): Promise<void> | null;
    /**
     * The other tab's state on top of the store's: two plain objects are merged (what ignoreKeys left out of storage
     * stays in memory); anything else is replaced whole.
     * @protected
     * @param {any} current
     * @param {any} incoming
     * @returns {any}
     */
    protected _merged(current: any, incoming: any): any;
    /**
     * Writes the state of a kept store. While a write is in progress, only the newest state is kept for the next one:
     * a burst of changes costs one write after the current, never one per change, and the last state always wins.
     * @protected
     * @param {KeptStore} kept
     * @param {any} state
     * @returns {Promise<void>} Done when the state given (or a newer one) was written; rejects when a write threw.
     */
    protected _persist(kept: KeptStore, state: any): Promise<void>;
    /**
     * Applies to a kept store the changes the other tabs tell (when syncTabs is on) — only those of its key and its
     * namespace (dbName), one after another in the order they came: reading or decrypting a change takes time, and an
     * older change must never land after a newer one. A change whose state this store already holds — ignoreKeys left
     * out, as stored — is not applied; a key removed in the other tab leaves this store's state as it is.
     * @protected
     * @param {KeptStore} kept
     * @param {() => any} current - The store's state now.
     * @param {(incoming: any) => void} apply - Puts the other tab's state in the store (kept.applying is true meanwhile,
     *   so the store's subscription does not write it back).
     */
    protected _listenToTabs(kept: KeptStore, current: () => any, apply: (incoming: any) => void): void;
    /**
     * Applies one change of another tab (see _listenToTabs). Never rejects: a failure is told through onError.
     * @private
     * @param {KeptStore} kept
     * @param {import("../adapters/StorageAdapter.js").DataChange} change
     * @param {() => any} current
     * @param {(incoming: any) => void} apply
     * @returns {Promise<void>}
     */
    private _applyChange;
    /**
     * Tells that a write of the store to storage failed: the storage adapters never throw on a write — they answer
     * false — so without this the app would never know its state was not saved.
     * @protected
     * @param {string} key - The storage key that was not saved.
     * @param {SetInStorageOptions} options
     * @param {unknown} [cause] - The error thrown, when the write threw.
     */
    protected _reportWriteFailure(key: string, options: SetInStorageOptions, cause?: unknown): void;
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
     * Recursively omits keys from an object based on an array of dot-notation key paths.
     *
     * @param {Object} obj The object to process
     * @param {string[]} ignoreKeys Array of keys to omit. Supports dot-notation for nested keys.
     * @returns {Object} A new object with the specified keys set to undefined (left out of the JSON)
     * @example
     * omitKeys({ password: '123', name: 'John' }, ['password'])
     * // => { password: undefined, name: 'John' }
     * omitKeys({ user: { password: '123', name: 'John' } }, ['user.password'])
     * // => { user: { password: undefined, name: 'John' } }
     */
    omitKeys(obj: any, ignoreKeys: string[]): any;
}
