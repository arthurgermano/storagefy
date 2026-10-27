globalThis.storagefyDebug ??= false;
globalThis.storagefyDebugLevel ??= 0;
const logError = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 0) {
    args.unshift("Storagefy Error:");
    console.error(...args);
  }
};
const logWarn = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 1) {
    args.unshift("Storagefy Warn:");
    console.warn(...args);
  }
};
const logInfo = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 2) {
    args.unshift("Storagefy:");
    console.info(...args);
  }
};
const logTrace = (...args) => {
  if (globalThis.storagefyDebug && globalThis.storagefyDebugLevel >= 3) {
    args.unshift("Storagefy:");
    console.trace(...args);
  }
};
export {
  logError,
  logInfo,
  logTrace,
  logWarn
};
//# sourceMappingURL=loggerHelper.js.map