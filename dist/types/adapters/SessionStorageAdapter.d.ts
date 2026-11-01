export default SessionStorageAdapter;
/**
 * @class SessionStorageAdapter
 * @extends WebStorageAdapter
 * A storage adapter for `sessionStorage` — encryption, expirations, metadata and the changes told to other tabs.
 */
declare class SessionStorageAdapter extends WebStorageAdapter {
    /**
     * @param {import("./StorageAdapter.js").StorageAdapterOptions} options
     * @throws {Error} If `sessionStorage` is not available, or an encryption option is invalid.
     */
    constructor(options: import("./StorageAdapter.js").StorageAdapterOptions);
}
import WebStorageAdapter from "./WebStorageAdapter.js";
