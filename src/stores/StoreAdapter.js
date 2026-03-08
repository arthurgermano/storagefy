import { logInfo } from "../helpers/loggerHelper.js";
import { assign } from "misc-helpers";

/**
 * Abstract base class for storage adapters. Provides the interface for concrete storage implementations.
 * All storage adapters should extend this class and implement its abstract methods.
 *
 * @module StoreAdapter
 * @abstract
 * @example
 * // Example of implementing a custom adapter:
 * class CustomAdapter extends StoreAdapter {
 *   async setInStorage(store, key, options) {
 *     // Implementation here
 *   }
 *
 *   async getFromStorage(store, key) {
 *     // Implementation here
 *   }
 * }
 */

class StoreAdapter {
  /**
   * Stores data in the specified storage with the given key.
   * @abstract
   * @async
   * @param {string} store The name/identifier of the storage location
   * @param {string} key The key under which to store the data
   * @param {Object} [options={}] Storage options
   * @param {*} options.value The value to store
   * @param {string[]} [options.ignoreKeys] Array of keys to ignore in the stored value
   * @param {number} [options.timeout] Timeout in milliseconds for the operation
   * @returns {Promise<void>}
   * @throws {Error} Must be implemented by subclasses
   * @throws {Error} May throw on timeout or storage failure
   * @example
   * await adapter.setInStorage('userData', 'preferences', {
   *   value: { theme: 'dark', tokens: 'secret' },
   *   ignoreKeys: ['tokens'], // Will exclude these keys from storage
   *   timeout: 5000 // 5 second timeout
   * });
   */
  async setInStorage(store, key, options = {}) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Retrieves data from the specified storage by key.
   * @abstract
   * @async
   * @param {string} store The name/identifier of the storage location
   * @param {string} key The key to retrieve
   * @param {number} [timeout] Optional timeout in milliseconds for the operation
   * @returns {Promise<*>} The stored value or null if not found
   * @throws {Error} Must be implemented by subclasses
   * @throws {Error} May throw on timeout or storage failure
   * @example
   * const preferences = await adapter.getFromStorage('userData', 'preferences', 2000); // 2 second timeout
   */
  async getFromStorage(store, key, timeout) {
    throw new Error("Not implemented");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Cleans up resources and subscriptions when the adapter is no longer needed.
   * Should be called before discarding the adapter instance.
   * @returns {void}
   * @example
   * adapter.destroy();
   */
  destroy(key) {
    if (
      this.stores &&
      this.stores[key] &&
      typeof this.stores[key].unsubscribe === "function"
    ) {
      logInfo("StoreAdapter - destroy - Unsubscribing from store changes.");
      this.stores[key].unsubscribe();
      delete this.stores[key];
      return;
    }
    logInfo("StoreAdapter - destroy - No unsubscribe function to call.");
  }

  // ----------------------------------------------------------------------------------------------

  /**
   * Recursively omits keys from an object based on an array of dot-notation key paths.
   * Maintains full backward compatibility with flat key names.
   *
   * @param {Object} obj The object to process
   * @param {string[]} ignoreKeys Array of keys to omit. Supports dot-notation for nested keys.
   * @returns {Object} A new object with the specified keys set to undefined
   * @example
   * // Flat keys (original behavior)
   * omitKeys({ password: '123', name: 'John' }, ['password'])
   * // => { password: undefined, name: 'John' }
   *
   * // Nested keys
   * omitKeys({ user: { password: '123', name: 'John' } }, ['user.password'])
   * // => { user: { password: undefined, name: 'John' } }
   *
   * // Mixed
   * omitKeys({ token: 'abc', user: { password: '123' } }, ['token', 'user.password'])
   * // => { token: undefined, user: { password: undefined } }
   */
  omitKeys(obj, ignoreKeys) {
    if (!obj || typeof obj !== "object" || !ignoreKeys?.length) return obj;

    const result = Array.isArray(obj) ? [...obj] : assign({}, obj);

    for (const key of Object.keys(result)) {
      // flat key — comportamento original mantido
      if (ignoreKeys.includes(key)) {
        result[key] = undefined;
        continue;
      }

      // chaves aninhadas com notação de ponto: "user.password"
      const nestedKeys = ignoreKeys
        .filter((k) => k.startsWith(key + "."))
        .map((k) => k.slice(key.length + 1));

      if (nestedKeys.length && result[key] && typeof result[key] === "object") {
        result[key] = this.omitKeys(result[key], nestedKeys);
      }
    }

    return result;
  }
}

// ------------------------------------------------------------------------------------------------

export default StoreAdapter;

// ------------------------------------------------------------------------------------------------
