import StoreAdapter from "./StoreAdapter.js";
import { isPlainObject, merged } from "../helpers/state.js";
import { logAndThrow, logError } from "../helpers/loggerHelper.js";
const STATE_METHODS = ["getState", "setState", "get", "set", "update"];
class ReactAdapter extends StoreAdapter {
  /**
   * Validates that a store can be kept: it has subscribe, and a way to be read or set that this adapter uses
   * (getState, setState, get, set or update).
   * @protected
   * @param {any} store
   * @throws {Error} If it cannot be kept.
   */
  _checkStore(store) {
    if (!store) {
      logAndThrow("Store provided is not defined");
    }
    if (typeof store.subscribe !== "function") {
      logAndThrow("Store must have a subscribe method");
    }
    if (!STATE_METHODS.some((name) => typeof store[name] === "function")) {
      logAndThrow(`Store must have one of: ${STATE_METHODS.join(", ")}`);
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The store's state now, as far as its interface tells.
   * @protected
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
   * Puts a stored state in the store, the way its library updates.
   * @protected
   * @param {any} store
   * @param {any} incoming
   */
  _apply(store, incoming) {
    if (typeof store.dispatch === "function" && typeof store.getState === "function") {
      store.dispatch({ type: "STORAGEFY_UPDATE", payload: merged(store.getState(), incoming) });
      return;
    }
    if (typeof store.getState === "function" && typeof store.setState === "function") {
      this._setState(store, merged(store.getState(), incoming));
      return;
    }
    if (typeof store.update === "function") {
      store.update((state) => merged(state, incoming));
      return;
    }
    if (typeof store.set === "function") {
      store.set(merged(this._currentOf(store), incoming));
      return;
    }
    logError("Unable to update store: No compatible update method found");
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * The state is read from the store whenever it tells it (getState, get): what a listener receives is relied on only
   * by a store that tells its state to its listeners alone.
   * @protected
   * @param {any} store
   * @param {import("./KeptStore.js").default} kept
   * @returns {import("./StoreAdapter.js").Subscription}
   */
  _subscribe(store, kept) {
    if (typeof store.getState === "function") {
      const firstWrite = kept.firstWrite(store.getState()).catch(() => {
      });
      return { unsubscribe: store.subscribe(() => kept.changed(store.getState())), firstWrite };
    }
    if (typeof store.get === "function") {
      return { unsubscribe: store.subscribe(() => kept.changed(store.get())), firstWrite: Promise.resolve() };
    }
    const unsubscribe = store.subscribe((...told) => {
      if (told.length > 0) {
        kept.changed(told[0]);
      }
    });
    return { unsubscribe, firstWrite: Promise.resolve() };
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * Dispatched to Redux (SET_STATE_FROM_STORAGE), set in the others.
   * @protected
   * @param {any} store
   * @param {string} key
   * @param {any} value
   * @returns {boolean}
   * @throws {Error} If the store cannot be set (no dispatch nor setState).
   */
  _load(store, key, value) {
    if (typeof store.dispatch === "function") {
      store.dispatch({ type: "SET_STATE_FROM_STORAGE", payload: value });
    } else if (typeof store.setState === "function") {
      this._setState(store, value);
    } else {
      logAndThrow("Cannot update store: setState or dispatch method not found");
    }
    return true;
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
}
var ReactAdapter_default = ReactAdapter;
export {
  ReactAdapter_default as default
};
//# sourceMappingURL=ReactAdapter.js.map