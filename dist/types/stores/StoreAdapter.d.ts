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
 * @property {string|undefined} stored - The stored part of the store's state (ignoreKeys left out), as JSON, as this
 *   store last wrote it, applied it or found it stored: a change that leaves it as it is writes nothing. undefined:
 *   not known (the next change is written).
 * @property {import("../adapters/StorageAdapter.js").Revision|undefined} revision - The revision of the state the store
 *   holds: only a newer one from another tab is applied.
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
    /**
     * - The stored part of the store's state (ignoreKeys left out), as JSON, as this
     * store last wrote it, applied it or found it stored: a change that leaves it as it is writes nothing. undefined:
     * not known (the next change is written).
     */
    stored: string | undefined;
    /**
     * - The revision of the state the store
     * holds: only a newer one from another tab is applied.
     */
    revision: import("../adapters/StorageAdapter.js").Revision | undefined;
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
    /** @type {Map<string, string>} */
    _loaded: Map<string, string>;
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
     * Keeps in mind what getFromStorage loaded under a key, for setInStorage to tell whether another tab wrote since.
     * @protected
     * @param {string} key
     * @param {any} loaded - The value read (null: none).
     */
    protected _rememberLoaded(key: string, loaded: any): void;
    /**
     * Starts following a kept store: the other tabs' changes (see _listenToTabs), and what storage holds now — what its
     * first write is compared with (see _firstWrite). When getFromStorage loaded the key before and storage holds
     * something else now, another tab wrote in between: that newer state is put in the store, not written over.
     * The read is first in the queue of the other tabs' changes: those told meanwhile are applied after it.
     * @protected
     * @param {KeptStore} kept
     * @param {() => any} current - The store's state now.
     * @param {(incoming: any) => void} apply - Puts a stored state in the store (see _listenToTabs).
     * @returns {Promise<void>} Never rejects.
     */
    protected _start(kept: KeptStore, current: () => any, apply: (incoming: any) => void): Promise<void>;
    /**
     * The stored part of a state (ignoreKeys left out), as JSON — what a write would store.
     * @private
     * @param {KeptStore} kept
     * @param {any} state
     * @returns {string|undefined} undefined when the state is not JSON (the write fails and tells why).
     */
    private _storedForm;
    /**
     * A change of a kept store, as its subscription hears it: written — unless it is another tab's state being applied
     * (it is not written back), or the stored part of the state did not change (only ignoreKeys did, or nothing). A
     * null or undefined state removes the stored key (a store emptied on sign-out is not loaded back), as the storage
     * adapters' set does; 0, false and "" are written as they are.
     *
     * The state given must be the store's own (read from it): a store adapter never passes a guess.
     * @protected
     * @param {KeptStore} kept
     * @param {any} state
     * @returns {Promise<void> | null} The write (see _persist), or null when nothing is written.
     */
    protected _onChange(kept: KeptStore, state: any): Promise<void> | null;
    /**
     * The first write of a kept store (after _start): its state is written — unless storage already holds its stored
     * part, then only the expiration is set again, as that write would have done. A tab that opens never writes a state
     * that is already stored, and so never undoes a newer change another tab made meanwhile.
     * @protected
     * @param {KeptStore} kept
     * @param {any} state - The store's state now.
     * @returns {Promise<void>} Rejects when the write threw (see _persist).
     */
    protected _firstWrite(kept: KeptStore, state: any): Promise<void>;
    /**
     * Sets the expiration of a stored state left as it is, as a write of it would (see SetInStorageOptions.timeout).
     * @private
     * @param {KeptStore} kept
     * @param {any} state - The store's state now.
     * @returns {Promise<void>}
     */
    private _renewExpiration;
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
     * older change must never land after a newer one. With a storage the tabs share (IndexedDB, localStorage), storage
     * is read again when the tab is shown again: in the background or in the browser's page cache, it may have missed
     * messages. See _applyChange for what is applied.
     * @protected
     * @param {KeptStore} kept
     * @param {() => any} current - The store's state now.
     * @param {(incoming: any) => void} apply - Puts the other tab's state in the store (kept.applying is true meanwhile,
     *   so the store's subscription does not write it back).
     */
    protected _listenToTabs(kept: KeptStore, current: () => any, apply: (incoming: any) => void): void;
    /**
     * Calls back each time the tab is shown again — back from the background, or from the browser's page cache — when
     * the tabs share the storage (IndexedDB, localStorage). Each tab has a sessionStorage of its own, with nothing of
     * the other tabs to read; outside a browser there is no tab.
     * @private
     * @param {() => void} callback
     * @returns {() => void} Stops it.
     */
    private _onTabShown;
    /**
     * Waits until no write of the store is in progress (a write that failed included: it was told through onError).
     * @private
     * @param {KeptStore} kept
     * @returns {Promise<void>}
     */
    private _ownWrites;
    /**
     * Applies one change of another tab, or what storage holds when the tab is shown again (see _listenToTabs) — only
     * when it is newer than the state the store holds (see Revision): a message heard late, or a state another tab
     * wrote before it knew this one, never undoes a newer state (when it may have reached storage after the store's own
     * write, that state is written again, see _writeAgainIfOverwritten). A state the
     * store already holds (ignoreKeys left out, as stored) is not applied again; a key removed in the other tab leaves
     * this store's state as it is. A change of 1.3.x (no revision) is applied as then: when the state differs. Never
     * rejects: a failure is told through onError.
     * @private
     * @param {KeptStore} kept
     * @param {import("../adapters/StorageAdapter.js").DataChange | null} change - null: read storage again.
     * @param {() => any} current
     * @param {(incoming: any) => void} apply
     * @returns {Promise<void>}
     */
    private _applyChange;
    /**
     * Writes the store's state again when another tab's write, older than the store's own last write, may have reached
     * storage after it — between tabs, localStorage orders no write of one with another's, and storage would keep the
     * state every tab left for the newer:
     *   - read from storage (the storage event, a tab shown again): it is there, it did;
     *   - told by its message: when it was not known as the store wrote, both were made at the same time and it may
     *     have — its write may even be on its way still. The storage event tells when it lands, but not always: Chromium
     *     leaves it out while this tab's own write is on its way.
     * Written again, storage ends with what the tabs hold — unless the older state is the store's (ignoreKeys left out):
     * storage holds it, whichever was saved last. Only with a storage the tabs share; with IndexedDB a write reads the
     * writes saved before it in its transaction, and none lands after a newer one. Never rejects: a failure is told
     * through onError (see _persist).
     * @private
     * @param {KeptStore} kept
     * @param {import("../adapters/StorageAdapter.js").Revision} revision - Of the other write: not newer than the
     *   store's.
     * @param {string} incomingForm - The other write's state, as JSON.
     * @param {boolean} fromStorage - Read from storage, not told by a message.
     * @param {() => any} current
     * @returns {Promise<void>}
     */
    private _writeAgainIfOverwritten;
    /**
     * Whether the state a kept store holds is its own last write (not another tab's, nor what storage held as it
     * started).
     * @private
     * @param {KeptStore} kept
     * @returns {boolean}
     */
    private _holdsOwnWrite;
    /**
     * Puts a state of storage (or of another tab) in the store — kept.applying is true meanwhile, so the store's
     * subscription does not write it back. A failure is told through onError.
     * @private
     * @param {KeptStore} kept
     * @param {any} incoming
     * @param {(incoming: any) => void} apply
     * @returns {boolean} Whether it was put.
     */
    private _put;
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
