import { logInfo } from "../helpers/loggerHelper.js";

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
    if (this.stores && this.stores[key] && typeof this.stores[key].unsubscribe === "function") {
      logInfo("StoreAdapter - destroy - Unsubscribing from store changes.");
      this.stores[key].unsubscribe
      delete this.stores[key];
      return;
    }
    logInfo("StoreAdapter - destroy - No unsubscribe function to call.");
  }
}

// ------------------------------------------------------------------------------------------------

export default StoreAdapter;

// ------------------------------------------------------------------------------------------------