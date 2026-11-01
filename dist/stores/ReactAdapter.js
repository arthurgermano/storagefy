import StoreAdapter, { isPlainObject } from "./StoreAdapter.js";
import { logError } from "../helpers/loggerHelper.js";
const STATE_METHODS = ["getState", "setState", "get", "set", "update"];
class ReactAdapter extends StoreAdapter {
  /**
   * @param {import("../adapters/StorageAdapter.js").default} adapter - The storage adapter.
   * @throws {Error} If no storage adapter is given.
   */
  constructor(adapter) {
    super(adapter);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Sets a whole state with setState: an object is merged as setState does; anything else (an array, a number…)
   * replaces the state — merged, an array would become an object.
   * @private
   * @param {any} store
   * @param {any} state
   */
  _setState(store, state) {
    if (isPlainObject(state)) {
      store.setState(state);
    } else {
      store.setState(state, true);
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The store's state now, as far as its interface tells.
   * @private
   * @param {any} store
   * @returns {any}
   */
  _currentOf(store) {
    if (typeof store.getState === "function") return store.getState();
    if (typeof store.get === "function") return store.get();
    return {};
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Puts another tab's state in the store, the way its library updates.
   * @private
   * @param {any} store
   * @param {object} incoming
   */
  _apply(store, incoming) {
    if (typeof store.dispatch === "function" && typeof store.getState === "function") {
      store.dispatch({ type: "STORAGEFY_UPDATE", payload: this._merged(store.getState(), incoming) });
      return;
    }
    if (typeof store.getState === "function" && typeof store.setState === "function") {
      this._setState(store, this._merged(store.getState(), incoming));
      return;
    }
    if (typeof store.update === "function") {
      store.update((state) => this._merged(state, incoming));
      return;
    }
    if (typeof store.set === "function") {
      store.set(this._merged(this._currentOf(store), incoming));
      return;
    }
    logError("Unable to update store: No compatible update method found");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Writes the store's state on every change (see StoreAdapter._persist) — and at once for a store that tells its
   * state (getState), as Redux and Zustand do. A null or undefined state removes the stored key. The state is read
   * with getState, or get; a store with neither is read from what it passes its listeners — a notification that
   * passes nothing writes nothing.
   * @param {any} store - A Redux, Zustand or compatible store.
   * @param {string} key - Storage key.
   * @param {import("./StoreAdapter.js").SetInStorageOptions} [options]
   * @returns {Promise<boolean>} true once the store is subscribed to and its state written (a store without getState
   *   is written on its first change).
   * @throws {Error} If the store is not supported.
   * @example
   * await reactAdapter.setInStorage(reduxStore, "user-state", { ignoreKeys: ["draft"] });
   */
  async setInStorage(store, key, options = {}) {
    this._checkStore(store);
    const kept = this._keep(key, store, options);
    const handleStateChange = (state) => (this._onChange(kept, state) ?? Promise.resolve()).catch(() => {
    });
    let firstWrite = Promise.resolve();
    if (typeof store.getState === "function") {
      firstWrite = handleStateChange(store.getState());
      kept.unsubscribe = store.subscribe(() => {
        handleStateChange(store.getState());
      });
    } else if (typeof store.get === "function") {
      kept.unsubscribe = store.subscribe(() => {
        handleStateChange(store.get());
      });
    } else {
      kept.unsubscribe = store.subscribe((...told) => {
        if (told.length > 0) {
          handleStateChange(told[0]);
        }
      });
    }
    this._listenToTabs(
      kept,
      () => this._currentOf(store),
      (incoming) => this._apply(store, incoming)
    );
    await firstWrite;
    return true;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Loads persisted state into the store — dispatched to Redux (SET_STATE_FROM_STORAGE), set in the others.
   * @param {any} store - A Redux, Zustand or compatible store.
   * @param {string} key - Storage key.
   * @param {import("./StoreAdapter.js").GetFromStorageOptions} [options]
   * @returns {Promise<true|undefined>} true when a state was loaded; undefined when there was none.
   * @throws {Error} If the store is not supported, or cannot be set (no dispatch nor setState).
   */
  async getFromStorage(store, key, options = {}) {
    this._checkStore(store);
    const storage = await this.adapter.get(key, { onError: options.onError });
    if (storage === null) {
      return;
    }
    if (typeof store.dispatch === "function") {
      store.dispatch({ type: "SET_STATE_FROM_STORAGE", payload: storage });
    } else if (typeof store.setState === "function") {
      this._setState(store, storage);
    } else {
      logError("Cannot update store: setState or dispatch method not found");
      throw new Error("Cannot update store: setState or dispatch method not found");
    }
    return true;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Validates that a store can be kept: it has subscribe, and a way to be read or set that this adapter uses
   * (getState, setState, get, set or update).
   * @private
   * @param {any} store
   * @throws {Error} If it cannot be kept.
   */
  _checkStore(store) {
    if (!store) {
      logError("Store provided is not defined");
      throw new Error("Store provided is not defined");
    }
    if (typeof store.subscribe !== "function") {
      logError("Store must have a subscribe method");
      throw new Error("Store must have a subscribe method");
    }
    if (!STATE_METHODS.some((name) => typeof store[name] === "function")) {
      logError(`Store must have one of: ${STATE_METHODS.join(", ")}`);
      throw new Error(`Store must have one of: ${STATE_METHODS.join(", ")}`);
    }
  }
}
var ReactAdapter_default = ReactAdapter;
export {
  ReactAdapter_default as default
};
//# sourceMappingURL=ReactAdapter.js.map