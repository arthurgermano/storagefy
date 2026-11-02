export default TabFollower;
export type Revision = import("../helpers/revisions.js").Revision;
export type DataChange = import("../adapters/StorageAdapter.js").DataChange;
/**
 * Applies to a kept store the changes the other tabs tell (syncTabs) — only those of its key and its namespace
 * (dbName), one after another in the order they came (see KeptStore.queue). With a storage the tabs share (IndexedDB,
 * localStorage), storage is read again when the tab is shown again (in the background or in the browser's page cache,
 * it may have missed messages), and when another tab's write reaches it after this store's own (see
 * _writeAgainIfOverwritten). See _applyChange for what is applied.
 */
declare class TabFollower {
    /**
     * Starts listening.
     * @param {import("./KeptStore.js").default} kept
     */
    constructor(kept: import("./KeptStore.js").default);
    kept: import("./KeptStore.js").default;
    _stop: () => void;
    /**
     * Stops listening to the other tabs.
     */
    stop(): void;
    /**
     * Queues a change of another tab, or a read of storage.
     * @private
     * @param {DataChange | null} change - null: read storage again.
     */
    private _follow;
    /**
     * Applies one change of another tab, or what storage holds — only when it is newer than the state the store holds
     * (see Revision): a message heard late, or a state another tab wrote before it knew this one, never undoes a newer
     * state (when it may have reached storage after the store's own write, that state is written again, see
     * _writeAgainIfOverwritten). A state the store already holds (ignoreKeys left out, as stored) is not applied again;
     * a key removed in the other tab leaves this store's state as it is. A change of 1.3.x (no revision) is applied as
     * then: when the state differs. Never rejects: a failure is told through onError.
     * @private
     * @param {DataChange | null} change - null: read storage again.
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
     * through onError (see KeptStore.persist).
     * @private
     * @param {Revision} revision - Of the other write: not newer than the store's.
     * @param {string} incomingForm - The other write's state, as JSON.
     * @param {boolean} fromStorage - Read from storage, not told by a message.
     * @returns {Promise<void>}
     */
    private _writeAgainIfOverwritten;
}
