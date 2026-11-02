import { assign } from "misc-helpers";

// ------------------------------------------------------------------------------------------------
// The state of a store as Storagefy handles it: what is left out of storage (ignoreKeys), and how another tab's state
// is put on top of it.
// ------------------------------------------------------------------------------------------------

/**
 * Whether a value is a plain object (not null, not an array) — the state merged with another tab's; anything else
 * (an array, a number, a string, a boolean) is replaced whole.
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ------------------------------------------------------------------------------------------------

/**
 * A stored state on top of a store's: two plain objects are merged (what ignoreKeys left out of storage stays in
 * memory); anything else is replaced whole.
 * @param {any} current
 * @param {any} incoming
 * @returns {any}
 */
export function merged(current, incoming) {
  return isPlainObject(current) && isPlainObject(incoming) ? { ...current, ...incoming } : incoming;
}

// ------------------------------------------------------------------------------------------------

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
export function omitKeys(obj, ignoreKeys) {
  if (!obj || typeof obj !== "object" || !ignoreKeys?.length) return obj;

  const result = Array.isArray(obj) ? [...obj] : assign({}, obj);

  for (const key of Object.keys(result)) {
    if (ignoreKeys.includes(key)) {
      result[key] = undefined;
      continue;
    }

    const nestedKeys = ignoreKeys.filter((k) => k.startsWith(key + ".")).map((k) => k.slice(key.length + 1));

    if (nestedKeys.length && result[key] && typeof result[key] === "object") {
      result[key] = omitKeys(result[key], nestedKeys);
    }
  }

  return result;
}

// ------------------------------------------------------------------------------------------------
