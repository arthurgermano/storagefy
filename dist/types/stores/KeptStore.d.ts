export default KeptStore;
export type Revision = import("../helpers/revisions.js").Revision;
export type SetInStorageOptions = import("./StoreAdapter.js").SetInStorageOptions;
/**
 * How a kept store is reached — what its store adapter knows of its library.
 */
export type KeptStoreParts = {
    /**
     * - The storage key.
     */
    key: string;
    /**
     * - The library's store.
     */
    store: any;
    /**
     * - Not changed: a copy is kept.
     */
    options: SetInStorageOptions;
    /**
     * - The storage adapter.
     */
    adapter: import("../adapters/StorageAdapter.js").default;
    /**
     * - The store's state now.
     */
    current: () => any;
    /**
     * - Puts a stored state in the store (it may throw: told through onError).
     */
    apply: (incoming: any) => void;
};
/** @typedef {import("../helpers/revisions.js").Revision} Revision */
/** @typedef {import("./StoreAdapter.js").SetInStorageOptions} SetInStorageOptions */
/**
 * How a kept store is reached — what its store adapter knows of its library.
 * @typedef {Object} KeptStoreParts
 * @property {string} key - The storage key.
 * @property {any} store - The library's store.
 * @property {SetInStorageOptions} options - Not changed: a copy is kept.
 * @property {import("../adapters/StorageAdapter.js").default} adapter - The storage adapter.
 * @property {() => any} current - The store's state now.
 * @property {(incoming: any) => void} apply - Puts a stored state in the store (it may throw: told through onError).
 */
/**
 * A store kept in storage under a key: what is known of its stored state, and its writes. A store adapter creates one
 * per key it keeps (see StoreAdapter._keep); with syncTabs, its TabFollower applies the other tabs' changes to it.
 */
declare class KeptStore {
    /**
     * @param {KeptStoreParts} parts
     */
    constructor({ key, store, options, adapter, current, apply }: KeptStoreParts);
    key: string;
    store: any;
    /** @type {SetInStorageOptions & { ignoreKeys: string[] }} */
    options: SetInStorageOptions & {
        ignoreKeys: string[];
    };
    adapter: import("../adapters/StorageAdapter.js").default;
    current: () => any;
    /** Whether the store is still kept: false once stopped (destroy, or kept again) */
    active: boolean;
    /** @type {TabFollower | null} Applies the other tabs' changes (syncTabs) */
    follower: TabFollower | null;
    /** @type {Revision|undefined} The revision of the state the store holds: only a newer one is applied */
    revision: Revision | undefined;
    _apply: (incoming: any) => void;
    /** @type {(() => void) | null} Stops listening to the store */
    _unsubscribe: (() => void) | null;
    _latest: any;
    /** @type {Promise<void> | null} */
    _writing: Promise<void> | null;
    _applying: boolean;
    /** @type {Promise<void>} */
    _queue: Promise<void>;
    /** @type {string|undefined} */
    _stored: string | undefined;
    /**
     * Reads what storage holds now — what the first write is compared with (see firstWrite). When getFromStorage loaded
     * the key before and storage holds something else now, another tab wrote in between: that newer state is put in the
     * store, not written over. The read is first in the queue of the other tabs' changes: those told meanwhile are
     * applied after it.
     * @param {string|undefined} loaded - What getFromStorage loaded, as JSON (undefined: it did not load the key).
     * @returns {Promise<void>} Never rejects.
     */
    start(loaded: string | undefined): Promise<void>;
    /**
     * Keeps how to stop listening to the store (see stop).
     * @param {() => void} unsubscribe
     */
    subscribed(unsubscribe: () => void): void;
    /**
     * Stops keeping the store: no more writes, no more changes from the other tabs. What is stored stays.
     */
    stop(): void;
    /**
     * Runs a task after the ones queued before it (the start read, the other tabs' changes): reading or decrypting a
     * change takes time, and an older one must never land after a newer one.
     * @param {() => Promise<void>} task - Never rejects.
     * @returns {Promise<void>}
     */
    queue(task: () => Promise<void>): Promise<void>;
    /**
     * The stored part of a state (ignoreKeys left out), as JSON — what a write would store.
     * @param {any} state
     * @returns {string|undefined} undefined when the state is not JSON (the write fails and tells why).
     */
    storedForm(state: any): string | undefined;
    /**
     * A change of the store, as its subscription hears it: written — unless it is a stored state being put in the store
     * (it is not written back), or the stored part of the state did not change (only ignoreKeys did, or nothing). A
     * null or undefined state removes the stored key (a store emptied on sign-out is not loaded back), as the storage
     * adapters' set does; 0, false and "" are written as they are.
     *
     * The state given must be the store's own (read from it): a store adapter never passes a guess.
     * @param {any} state
     * @returns {Promise<void> | null} The write (see persist), or null when nothing is written.
     */
    onChange(state: any): Promise<void> | null;
    /**
     * A change of the store heard by its subscription, written as onChange says — a failed write is told through
     * onError, never thrown at the library.
     * @param {any} state
     */
    changed(state: any): void;
    /**
     * The first write (after start): the store's state is written — unless storage already holds its stored part, then
     * only the expiration is set again, as that write would have done. A tab that opens never writes a state that is
     * already stored, and so never undoes a newer change another tab made meanwhile.
     * @param {any} state - The store's state now.
     * @returns {Promise<void>} Rejects when the write threw (see persist).
     */
    firstWrite(state: any): Promise<void>;
    /**
     * Sets the expiration of a stored state left as it is, as a write of it would (see SetInStorageOptions.timeout).
     * @private
     * @param {any} state - The store's state now.
     * @returns {Promise<void>}
     */
    private _renewExpiration;
    /**
     * Writes a state of the store. While a write is in progress, only the newest state is kept for the next one: a
     * burst of changes costs one write after the current, never one per change, and the last state always wins.
     * @param {any} state
     * @returns {Promise<void>} Done when the state given (or a newer one) was written; rejects when a write threw.
     */
    persist(state: any): Promise<void>;
    /**
     * Whether a write of the store is in progress.
     * @returns {boolean}
     */
    get writing(): boolean;
    /**
     * Waits until no write of the store is in progress (a write that failed included: it was told through onError).
     * @returns {Promise<void>}
     */
    ownWritesDone(): Promise<void>;
    /**
     * Whether the state the store holds is its own last write (not another tab's, nor what storage held as it
     * started).
     * @returns {boolean}
     */
    holdsOwnWrite(): boolean;
    /**
     * Takes a stored state (another tab's, or what storage holds): put in the store unless the store holds it already
     * (ignoreKeys left out, as stored), then known as stored — of its revision, when it has one.
     * @param {any} incoming
     * @param {Revision} [revision]
     */
    adopt(incoming: any, revision?: Revision): void;
    /**
     * Puts a stored state in the store — while it does, the store's subscription does not write it back. A failure is
     * told through onError.
     * @param {any} incoming
     * @returns {boolean} Whether it was put.
     */
    put(incoming: any): boolean;
    /**
     * Tells the app that the store's state could not be saved, read or applied: the storage adapters never throw on a
     * write — they answer false — so without this the app would never know.
     * @param {"read"|"save"|"apply"} action
     * @param {unknown} [cause] - The error thrown, when there was one.
     */
    report(action: "read" | "save" | "apply", cause?: unknown): void;
}
import TabFollower from "./TabFollower.js";
