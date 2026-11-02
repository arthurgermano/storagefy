import WebStorageAdapter from "./WebStorageAdapter.js";

// -------------------------------------------------------------------------------------------------

/**
 * @class SessionStorageAdapter
 * @extends WebStorageAdapter
 * A storage adapter for `sessionStorage` — encryption, expirations, metadata and the changes told to other tabs.
 */
class SessionStorageAdapter extends WebStorageAdapter {
  /**
   * @param {import("./StorageAdapter.js").StorageAdapterOptions} options
   * @throws {Error} If `sessionStorage` is not available, or an encryption option is invalid.
   */
  constructor(options) {
    super(options, { storageName: "sessionStorage", label: "SessionStorage", shared: false });
  }
}

// ------------------------------------------------------------------------------------------------

export default SessionStorageAdapter;

// ------------------------------------------------------------------------------------------------
