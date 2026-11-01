import { logError } from "./loggerHelper.js";
function reportFailure(action, key, onError, cause) {
  const error = new Error(`Storagefy: could not ${action} "${key}"`, cause === void 0 ? void 0 : { cause });
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
export {
  reportFailure
};
//# sourceMappingURL=failureReport.js.map