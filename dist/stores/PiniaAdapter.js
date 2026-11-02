import StoreAdapter from "./StoreAdapter.js";
import { reportFailure } from "../helpers/failureReport.js";
import { logAndThrow } from "../helpers/loggerHelper.js";
import { isPlainObject, merged } from "../helpers/state.js";
const NOT_AN_OBJECT = "Storagefy: the stored state of a Pinia store must be an object";
class PiniaAdapter extends StoreAdapter {
  /**
   * Validates that a Pinia store has the required methods.
   * @protected
   * @param {any} store
   * @throws {Error} If it is not a Pinia store.
   */
  _checkStore(store) {
    if (!store || !store.$subscribe || !store.$patch) {
      logAndThrow("Store provided is not defined");
    }
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * @protected
   * @param {any} store
   * @returns {object}
   */
  _currentOf(store) {
    return store.$state;
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * @protected
   * @param {any} store
   * @param {any} incoming
   * @throws {Error} If it is not an object.
   */
  _apply(store, incoming) {
    if (!isPlainObject(incoming)) {
      throw new Error(NOT_AN_OBJECT);
    }
    store.$state = merged(store.$state, incoming);
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * @protected
   * @param {any} store
   * @param {import("./KeptStore.js").default} kept
   * @returns {import("./StoreAdapter.js").Subscription}
   */
  _subscribe(store, kept) {
    const unsubscribe = store.$subscribe((mutation, state) => kept.changed(state));
    return { unsubscribe, firstWrite: kept.firstWrite(store.$state) };
  }
  // ----------------------------------------------------------------------------------------------
  /**
   * A stored state that is not an object is not loaded — told through onError.
   * @protected
   * @param {any} store
   * @param {string} key
   * @param {any} value
   * @param {import("./StoreAdapter.js").GetFromStorageOptions} options
   * @returns {boolean}
   */
  _load(store, key, value, options) {
    if (!isPlainObject(value)) {
      reportFailure("read", key, options.onError, new Error(NOT_AN_OBJECT));
      return false;
    }
    store.$patch(value);
    return true;
  }
}
var PiniaAdapter_default = PiniaAdapter;
export {
  PiniaAdapter_default as default
};
//# sourceMappingURL=PiniaAdapter.js.map