import WebStorageAdapter from "./WebStorageAdapter.js";

// -------------------------------------------------------------------------------------------------

/**
 * @class LocalStorageAdapter
 * @extends WebStorageAdapter
 * A storage adapter for `localStorage` — encryption, expirations, metadata and the changes told to other tabs.
 */
class LocalStorageAdapter extends WebStorageAdapter {
  /**
   * @param {import("./StorageAdapter.js").StorageAdapterOptions} options
   * @throws {Error} If `localStorage` is not available, or an encryption option is invalid.
   */
  constructor(options) {
    super(options, { storageName: "localStorage", label: "LocalStorage", shared: true });
  }
}

// ------------------------------------------------------------------------------------------------

export default LocalStorageAdapter;

// ------------------------------------------------------------------------------------------------
