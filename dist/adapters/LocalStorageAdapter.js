import WebStorageAdapter from "./WebStorageAdapter.js";
class LocalStorageAdapter extends WebStorageAdapter {
  /**
   * @param {import("./StorageAdapter.js").StorageAdapterOptions} options
   * @throws {Error} If `localStorage` is not available, or an encryption option is invalid.
   */
  constructor(options) {
    super(options, { storageName: "localStorage", label: "LocalStorage", shared: true });
  }
}
var LocalStorageAdapter_default = LocalStorageAdapter;
export {
  LocalStorageAdapter_default as default
};
//# sourceMappingURL=LocalStorageAdapter.js.map