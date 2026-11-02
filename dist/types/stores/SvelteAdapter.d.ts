export default SvelteAdapter;
/**
 * Svelte storage adapter: keeps a Svelte writable store's value in a storage adapter — any value: an object, an
 * array, a number, a string, a boolean. null or undefined removes the stored key (a store emptied on sign-out is not
 * loaded back). The first write of setInStorage is made at once (unless storage already holds the value), and it
 * throws when that write threw.
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
     * @protected
     * @param {any} store
     * @param {string} key
     * @param {any} value
     * @returns {boolean}
     */
    protected _load(store: any, key: string, value: any): boolean;
}
import StoreAdapter from "./StoreAdapter.js";
