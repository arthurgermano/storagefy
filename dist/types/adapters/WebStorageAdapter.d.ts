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
     * - Whether the tabs of the app share it (localStorage) or each has its own
     * (sessionStorage).
     */
    shared: boolean;
};
/**
 * Which Web Storage an adapter uses.
 * @typedef {Object} WebStorageKind
 * @property {"localStorage"|"sessionStorage"} storageName - The global it reads and writes.
 * @property {string} label - Its name in messages.
 * @property {boolean} shared - Whether the tabs of the app share it (localStorage) or each has its own
 *   (sessionStorage).
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
    constructor(options: import("./StorageAdapter.js").StorageAdapterOptions, kind: WebStorageKind);
    kind: WebStorageKind;
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
     * A record of the namespace (expirations, revisions) — empty when there is none, or it is not JSON (logged).
     * @private
     * @param {string} recordKey
     * @returns {Object<string, any>}
     */
    private _loadRecord;
    /**
     * Removes the entry of a key from a record of the namespace — written only when the key had one.
     * @private
     * @param {string} recordKey
     * @param {string} key - The key of the entry (expirations: the storage key; revisions: as stored).
     */
    private _forgetEntry;
    /**
     * The expiration timestamps of the namespace.
     * @protected
     * @returns {Object<string, number>}
     */
    protected _loadExpires(): {
        [x: string]: number;
    };
    /**
     * Writes the expiration timestamps.
     * @private
     * @param {Object<string, number>} expires
     */
    private _saveExpires;
}
import StorageAdapter from "./StorageAdapter.js";
