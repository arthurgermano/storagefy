export default ReactAdapter;
/**
 * React state persistence adapter: keeps the state of a Redux, Zustand or compatible store (one with subscribe and
 * getState/setState) in a storage adapter.
 *
 * The state is read with getState, or get; a store with neither is read from what it passes its listeners — a
 * notification that passes nothing writes nothing. A store that tells its state (getState), as Redux and Zustand do,
 * is written at once by setInStorage (unless storage already holds it), and setInStorage throws when that write
 * threw; the others are written on their first change. A null or undefined state removes the stored key.
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
     * Dispatched to Redux (SET_STATE_FROM_STORAGE), set in the others.
     * @protected
     * @param {any} store
     * @param {string} key
     * @param {any} value
     * @returns {boolean}
     * @throws {Error} If the store cannot be set (no dispatch nor setState).
     */
    protected _load(store: any, key: string, value: any): boolean;
    /**
     * Sets a whole state with setState: an object is merged as setState does; anything else (an array, a number…)
     * replaces the state — merged, an array would become an object.
     * @private
     * @param {any} store
     * @param {any} state
     */
    private _setState;
}
import StoreAdapter from "./StoreAdapter.js";
