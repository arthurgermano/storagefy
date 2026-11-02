export default WebStorageAdapter;
/**
 * Which Web Storage an adapter uses.
 */
export type WebStorageKind = {
    /**
     * - The global it reads and writes.
     */
    storageName: "localStorage" | "sessionStorage";
    /**
     * - Its name in messages.
     */
    label: string;
    /**
     * - Whether the tabs of the app share it (localStorage) or each has its own (sessionStorage).
     */
    shared: boolean;
};
/**
 * Which Web Storage an adapter uses.
 * @typedef {Object} WebStorageKind
 * @property {"localStorage"|"sessionStorage"} storageName - The global it reads and writes.
 * @property {string} label - Its name in messages.
 * @property {boolean} shared - Whether the tabs of the app share it (localStorage) or each has its own (sessionStorage).
 */
/**
 * @class WebStorageAdapter
 * @extends StorageAdapter
 * The storage adapter of localStorage and sessionStorage — the same code over either (LocalStorageAdapter and
 * SessionStorageAdapter choose which). Encryption, expirations, metadata and the changes told to other tabs.
 */
declare class WebStorageAdapter extends StorageAdapter {
    /**
     * @param {import("./StorageAdapter.js").StorageAdapterOptions} options
     * @param {WebStorageKind} kind
     * @throws {Error} If the storage is not available, or an encryption option is invalid.
     */
    constructor({ dbName, version, encrypt, password, keyDerivation, expireCheckInterval, description, channelName, enableSyncTabs, }: import("./StorageAdapter.js").StorageAdapterOptions, kind: WebStorageKind);
    kind: WebStorageKind;
    dbName: string;
    encrypt: boolean;
    expireKey: string;
    metaKey: string;
    revisionKey: string;
    prefix: string;
    adapterId: string;
    expireCheckInterval: number;
    enableSyncTabs: boolean;
    /**
     * The storage, looked up on each use.
     * @private
     * @returns {Storage}
     */
    private get _storage();
    /**
     * Writes the metadata of the namespace.
     * @private
     */
    private _initMeta;
    /**
     * The expiration timestamps of the namespace.
     * @private
     * @returns {Object<string, number>}
     */
    private _loadExpires;
    /**
     * Writes the expiration timestamps.
     * @private
     * @param {Object<string, number>} expires
     */
    private _saveExpires;
    /**
     * Forgets the expiration of a key — written only when the key had one.
     * @private
     * @param {string} key
     */
    private _forgetExpire;
    /**
     * The revisions of the namespace (see StorageAdapter._revisionIn).
     * @private
     * @returns {Object<string, unknown>}
     */
    private _loadRevisions;
    /**
     * Forgets the revision of a key — written only when the key had one.
     * @private
     * @param {string} key
     */
    private _forgetRevision;
    /**
     * Removes a key and its expiration, and tells the other tabs.
     * @private
     * @param {string} key
     */
    private _deleteNow;
    /**
     * Removes every key of the namespace and the expirations record, now.
     * @private
     */
    private _resetNow;
}
import StorageAdapter from "./StorageAdapter.js";
