export default PiniaAdapter;
/**
 * Pinia storage adapter: keeps a Pinia store's state in a storage adapter.
 * @class PiniaAdapter
 * @extends StoreAdapter
 * @example
 * const piniaAdapter = new PiniaAdapter(new IndexedDBAdapter({ dbName: "my-app" }));
 * await piniaAdapter.getFromStorage(useUserStore(), "user-state");
 * await piniaAdapter.setInStorage(useUserStore(), "user-state", { ignoreKeys: ["draft"] });
 */
declare class PiniaAdapter extends StoreAdapter {
    /**
     * Validates that a Pinia store has the required methods.
     * @private
     * @param {any} store
     * @throws {Error} If it is not a Pinia store.
     */
    private _checkStore;
}
import StoreAdapter from "./StoreAdapter.js";
