export default StoreAdapter;
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
declare class StoreAdapter {
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
    setInStorage(store: string, key: string, options?: {
        value: any;
        ignoreKeys?: string[];
        timeout?: number;
    }): Promise<void>;
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
    getFromStorage(store: string, key: string, timeout?: number): Promise<any>;
    /**
     * Cleans up resources and subscriptions when the adapter is no longer needed.
     * Should be called before discarding the adapter instance.
     * @returns {void}
     * @example
     * adapter.destroy();
     */
    /**
     * Tells that a write of the store to storage failed: the storage adapters never throw on a write — they answer
     * false — so without this the app would never know its state was not saved. Calls `options.onError` when given; a
     * callback that throws is logged, never passed on to the store.
     * @protected
     * @param {string} key - The storage key that was not saved.
     * @param {{ onError?: Function }} options - The options given to setInStorage.
     * @param {unknown} [cause] - The error thrown, when the write threw.
     */
    protected _reportWriteFailure(key: string, options: {
        onError?: Function;
    }, cause?: unknown): void;
    destroy(key: any): void;
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
    omitKeys(obj: any, ignoreKeys: string[]): any;
}
