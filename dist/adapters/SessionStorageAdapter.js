import WebStorageAdapter from "./WebStorageAdapter.js";
class SessionStorageAdapter extends WebStorageAdapter {
  /**
   * @param {import("./StorageAdapter.js").StorageAdapterOptions} options
   * @throws {Error} If `sessionStorage` is not available, or an encryption option is invalid.
   */
  constructor(options) {
    super(options, { storageName: "sessionStorage", label: "SessionStorage", shared: false });
  }
}
var SessionStorageAdapter_default = SessionStorageAdapter;
export {
  SessionStorageAdapter_default as default
};
//# sourceMappingURL=SessionStorageAdapter.js.map