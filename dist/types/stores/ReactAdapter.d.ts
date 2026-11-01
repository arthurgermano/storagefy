export default ReactAdapter;
/**
 * React state persistence adapter: keeps the state of a Redux, Zustand or compatible store (one with subscribe and
 * getState/setState) in a storage adapter.
 * @class ReactAdapter
 * @extends StoreAdapter
 * @example
 * // Redux and IndexedDB
 * const reduxAdapter = new ReactAdapter(new IndexedDBAdapter({ dbName: "app-state" }));
 * await reduxAdapter.getFromStorage(store, "redux-state");
 * await reduxAdapter.setInStorage(store, "redux-state");
 *
 * // Zustand
 * const zustandAdapter = new ReactAdapter(new LocalStorageAdapter({ dbName: "app-state" }));
 * await zustandAdapter.setInStorage(useStore, "zustand-state");
 */
declare class ReactAdapter extends StoreAdapter {
    /**
     * Sets a whole state with setState: an object is merged as setState does; anything else (an array, a number…)
     * replaces the state — merged, an array would become an object.
     * @private
     * @param {any} store
     * @param {any} state
     */
    private _setState;
    /**
     * The store's state now, as far as its interface tells.
     * @private
     * @param {any} store
     * @returns {any}
     */
    private _currentOf;
    /**
     * Puts another tab's state in the store, the way its library updates.
     * @private
     * @param {any} store
     * @param {object} incoming
     */
    private _apply;
    /**
     * Validates that a store can be kept: it has subscribe, and a way to be read or set that this adapter uses
     * (getState, setState, get, set or update).
     * @private
     * @param {any} store
     * @throws {Error} If it cannot be kept.
     */
    private _checkStore;
}
import StoreAdapter from "./StoreAdapter.js";
