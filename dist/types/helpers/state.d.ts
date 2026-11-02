/**
 * Whether a value is a plain object (not null, not an array) — the state merged with another tab's; anything else
 * (an array, a number, a string, a boolean) is replaced whole.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isPlainObject(value: unknown): value is Record<string, any>;
/**
 * A stored state on top of a store's: two plain objects are merged (what ignoreKeys left out of storage stays in
 * memory); anything else is replaced whole.
 * @param {any} current
 * @param {any} incoming
 * @returns {any}
 */
export function merged(current: any, incoming: any): any;
/**
 * Recursively omits keys from an object based on an array of dot-notation key paths.
 *
 * @param {Object} obj The object to process
 * @param {string[]} ignoreKeys Array of keys to omit. Supports dot-notation for nested keys.
 * @returns {Object} A new object with the specified keys set to undefined (left out of the JSON)
 * @example
 * omitKeys({ password: '123', name: 'John' }, ['password'])
 * // => { password: undefined, name: 'John' }
 * omitKeys({ user: { password: '123', name: 'John' } }, ['user.password'])
 * // => { user: { password: undefined, name: 'John' } }
 */
export function omitKeys(obj: any, ignoreKeys: string[]): any;
