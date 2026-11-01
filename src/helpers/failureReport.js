import { logError } from "./loggerHelper.js";

// ------------------------------------------------------------------------------------------------

/**
 * Tells the app that Storagefy could not read or save a key. The adapters never throw on a read or a write — a read
 * answers null, a write false — so without this the app would never know. Logged too (in debug mode); a callback
 * that throws is logged, never passed on.
 * @param {"read"|"save"|"apply"} action - What failed (apply: another tab's state could not be put in the store).
 * @param {string} key - The storage key.
 * @param {((error: Error) => void) | undefined} onError - The app's callback, when it gave one.
 * @param {unknown} [cause] - The error thrown, when there was one.
 */
export function reportFailure(action, key, onError, cause) {
  const error = new Error(`Storagefy: could not ${action} "${key}"`, cause === undefined ? undefined : { cause });
  logError(error);
  if (typeof onError !== "function") {
    return;
  }
  try {
    onError(error);
  } catch (callbackError) {
    logError("Storagefy: onError callback threw:", callbackError);
  }
}

// ------------------------------------------------------------------------------------------------
