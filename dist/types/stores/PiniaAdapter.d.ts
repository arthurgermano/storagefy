export default PiniaAdapter;
/**
 * Pinia storage adapter: keeps a Pinia store's state in a storage adapter. The first write of setInStorage is made at
 * once (unless storage already holds the state), and it throws when that write threw.
 * @class PiniaAdapter
 * @extends StoreAdapter
 * @example
 * const piniaAdapter = new PiniaAdapter(new IndexedDBAdapter({ dbName: "my-app" }));
 * await piniaAdapter.getFromStorage(useUserStore(), "user-state");
 * await piniaAdapter.setInStorage(useUserStore(), "user-state", { ignoreKeys: ["draft"] });
 */
declare class PiniaAdapter extends StoreAdapter {
}
import StoreAdapter from "./StoreAdapter.js";
