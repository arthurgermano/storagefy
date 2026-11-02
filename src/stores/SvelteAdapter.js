import StoreAdapter from "./StoreAdapter.js";
import { logAndThrow } from "../helpers/loggerHelper.js";
import { merged } from "../helpers/state.js";

// ------------------------------------------------------------------------------------------------

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
class SvelteAdapter extends StoreAdapter {
  /**
   * @protected
   * @param {any} store
   * @throws {Error} If it is not a Svelte writable store.
   */
  _checkStore(store) {
    if (!store || typeof store.subscribe !== "function" || typeof store.set !== "function") {
      logAndThrow("Store provided is not a valid Svelte writable store");
    }
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * The store's value now: a Svelte store tells it to a subscriber at once.
   * @protected
   * @param {any} store
   * @returns {any}
   */
  _currentOf(store) {
    let value;
    store.subscribe((current) => {
      value = current;
    })();
    return value;
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * @protected
   * @param {any} store
   * @param {any} incoming
   */
  _apply(store, incoming) {
    store.update((current) => merged(current, incoming));
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * A Svelte store calls its subscriber at once with the value it holds: that is the first write.
   * @protected
   * @param {any} store
   * @param {import("./KeptStore.js").default} kept
   * @returns {import("./StoreAdapter.js").Subscription}
   */
  _subscribe(store, kept) {
    let firstWrite = Promise.resolve();
    let started = false;
    const unsubscribe = store.subscribe((state) => {
      if (!started) {
        started = true;
        firstWrite = kept.firstWrite(state);
        return;
      }
      kept.changed(state);
    });
    return { unsubscribe, firstWrite };
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * @protected
   * @param {any} store
   * @param {string} key
   * @param {any} value
   * @returns {boolean}
   */
  _load(store, key, value) {
    store.set(value);
    return true;
  }
}

// ------------------------------------------------------------------------------------------------

export default SvelteAdapter;

// ------------------------------------------------------------------------------------------------
