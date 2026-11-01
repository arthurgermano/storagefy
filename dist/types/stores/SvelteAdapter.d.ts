export default SvelteAdapter;
/**
 * Svelte storage adapter: keeps a Svelte writable store's value in a storage adapter.
 * @class SvelteAdapter
 * @extends StoreAdapter
 * @example
 * import { writable } from "svelte/store";
 * const userStore = writable({ name: "" });
 * const svelteAdapter = new SvelteAdapter(new LocalStorageAdapter({ dbName: "my-app" }));
 * await svelteAdapter.getFromStorage(userStore, "user-data");
 * await svelteAdapter.setInStorage(userStore, "user-data");
 */
declare class SvelteAdapter extends StoreAdapter {
    /**
     * The store's value now.
     * @private
     * @param {any} store
     * @returns {any}
     */
    private _valueOf;
    /**
     * @private
     * @param {any} store
     * @throws {Error} If it is not a Svelte writable store.
     */
    private _checkStore;
}
import StoreAdapter from "./StoreAdapter.js";
