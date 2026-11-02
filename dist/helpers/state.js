import { assign } from "misc-helpers";
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function merged(current, incoming) {
  return isPlainObject(current) && isPlainObject(incoming) ? { ...current, ...incoming } : incoming;
}
function omitKeys(obj, ignoreKeys) {
  if (!obj || typeof obj !== "object" || !ignoreKeys?.length) return obj;
  const result = Array.isArray(obj) ? [...obj] : assign({}, obj);
  for (const key of Object.keys(result)) {
    if (ignoreKeys.includes(key)) {
      result[key] = void 0;
      continue;
    }
    const nestedKeys = ignoreKeys.filter((k) => k.startsWith(key + ".")).map((k) => k.slice(key.length + 1));
    if (nestedKeys.length && result[key] && typeof result[key] === "object") {
      result[key] = omitKeys(result[key], nestedKeys);
    }
  }
  return result;
}
export {
  isPlainObject,
  merged,
  omitKeys
};
//# sourceMappingURL=state.js.map