/**
 * Global debug flag.
 * Set to `true` to enable logging.
 * @type {boolean}
 */
globalThis.storagefyDebug = true;

/**
 * Global debug level.
 * Controls the verbosity of logs.
 * 
 * Levels:
 * - 0: Only errors
 * - 1: Warnings
 * - 2: Info
 * - 3: Trace
 * 
 * @type {number}
 */
globalThis.storagefyDebugLevel = 0;

// ------------------------------------------------------------------------------------------------

/**
 * Logs an error message if `storagefyDebug` is enabled.
 * 
 * @param {...any} args - Arguments to log.
 */
export const logError = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 0) {
    args.unshift("Storagefy Error:");
    console.error(...args);
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Logs a warning message if `storagefyDebug` is enabled and level is >= 1.
 * 
 * @param {...any} args - Arguments to log.
 */
export const logWarn = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 1) {
    args.unshift("Storagefy Warn:");
    console.warn(...args);
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Logs an info message if `storagefyDebug` is enabled and level is >= 2.
 * 
 * @param {...any} args - Arguments to log.
 */
export const logInfo = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 2) {
    args.unshift("Storagefy:");
    console.info(...args);
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Logs a trace message if `storagefyDebug` is enabled and level is >= 3.
 * 
 * @param {...any} args - Arguments to log.
 */
export const logTrace = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 3) {
    args.unshift("Storagefy:");
    console.trace(...args);
  }
};

// ------------------------------------------------------------------------------------------------
