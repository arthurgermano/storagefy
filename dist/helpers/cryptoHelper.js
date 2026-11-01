import { logError, logInfo } from "./loggerHelper.js";
import { base64To, base64From } from "misc-helpers";
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
const KEY_DERIVATIONS = Object.freeze(["hkdf", "pbkdf2"]);
const DEFAULT_KEY_DERIVATION = "hkdf";
const ENVELOPE_VERSION = 2;
const PBKDF2_ITERATIONS = 1e5;
const HKDF_INFO = ENCODER.encode("storagefy:aes-gcm-256");
const IV_BYTES = 12;
const BINARY_CHUNK = 32768;
function webCrypto() {
  const crypto = globalThis.crypto;
  if (!crypto || !crypto.subtle) {
    logError("CryptoHelper - Web Crypto API not available");
    throw new Error("Crypto API not available");
  }
  return crypto;
}
function isKeyDerivation(value) {
  return KEY_DERIVATIONS.includes(value);
}
function bytesToBinary(bytes) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += BINARY_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(start, start + BINARY_CHUNK));
  }
  return binary;
}
function bytesToBase64(bytes) {
  return btoa(bytesToBinary(bytes));
}
function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
const deriveKey = async (password, salt, extractable = false, keyDerivation = "pbkdf2") => {
  try {
    if (typeof password !== "string" || !password.length) {
      throw new Error("Invalid password");
    }
    if (!isKeyDerivation(keyDerivation)) {
      throw new Error(`Unknown key derivation: ${String(keyDerivation)}`);
    }
    logInfo("CryptoHelper - Deriving key", { keyDerivation, extractable });
    const subtle = webCrypto().subtle;
    const keyMaterial = await subtle.importKey(
      "raw",
      ENCODER.encode(password),
      keyDerivation === "hkdf" ? "HKDF" : "PBKDF2",
      false,
      ["deriveKey"]
    );
    const algorithm = keyDerivation === "hkdf" ? { name: "HKDF", hash: "SHA-256", salt: ENCODER.encode(salt ?? ""), info: HKDF_INFO } : { name: "PBKDF2", hash: "SHA-256", salt: ENCODER.encode(salt), iterations: PBKDF2_ITERATIONS };
    return await subtle.deriveKey(algorithm, keyMaterial, { name: "AES-GCM", length: 256 }, extractable, [
      "encrypt",
      "decrypt"
    ]);
  } catch (error) {
    logError("Error deriving key:", error);
    throw error;
  }
};
async function sealText(key, text, keyDerivation) {
  const iv = webCrypto().getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await webCrypto().subtle.encrypt({ name: "AES-GCM", iv }, key, ENCODER.encode(text));
  return { v: ENVELOPE_VERSION, kdf: keyDerivation, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) };
}
async function openText(key, envelope) {
  const decrypted = await webCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.data)
  );
  return DECODER.decode(decrypted);
}
const encryptData = async (key, dataObj, raw = false) => {
  if (dataObj === void 0 || typeof dataObj === "function" || typeof dataObj === "symbol") {
    throw new Error("Invalid data type for encryption");
  }
  try {
    logInfo("CryptoHelper - Encrypting data", { raw });
    const iv = webCrypto().getRandomValues(new Uint8Array(IV_BYTES));
    const encoded = ENCODER.encode(JSON.stringify(dataObj));
    const encrypted = new Uint8Array(await webCrypto().subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
    if (raw) {
      return { iv, data: encrypted };
    }
    return { iv: base64To(bytesToBinary(iv)), data: base64To(bytesToBinary(encrypted)) };
  } catch (error) {
    logError("Error encrypting data:", error);
    throw error;
  }
};
const decryptData = async (key, encryptedObj, raw = false) => {
  try {
    logInfo("CryptoHelper - Decrypting data", { raw });
    const decode = (value) => raw ? new Uint8Array(value) : Uint8Array.from(base64From(value), (char) => char.charCodeAt(0));
    const decrypted = await webCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: decode(encryptedObj.iv) },
      key,
      decode(encryptedObj.data)
    );
    return JSON.parse(DECODER.decode(decrypted));
  } catch (error) {
    logError("Error decrypting data:", error);
    throw error;
  }
};
const MAX_CODE_POINT = 1114111;
const SURROGATES = { first: 55296, last: 57343 };
function shiftCodePoint(codePoint, step) {
  let next = codePoint + step;
  if (next >= SURROGATES.first && next <= SURROGATES.last) {
    next += step * (SURROGATES.last - SURROGATES.first + 1);
  }
  if (next > MAX_CODE_POINT) return 0;
  if (next < 0) return MAX_CODE_POINT;
  return next;
}
function simpleObfuscate(str) {
  if (!str) return str;
  logInfo("CryptoHelper - Obfuscating string");
  const shifted = [...str].map((char) => String.fromCodePoint(shiftCodePoint(char.codePointAt(0), 1))).join("");
  return base64To(shifted);
}
function simpleDeobfuscate(str) {
  if (!str) return str;
  logInfo("CryptoHelper - Deobfuscating string");
  const decoded = base64From(str);
  return [...decoded].map((char) => String.fromCodePoint(shiftCodePoint(char.codePointAt(0), -1))).join("");
}
export {
  DEFAULT_KEY_DERIVATION,
  ENVELOPE_VERSION,
  KEY_DERIVATIONS,
  base64ToBytes,
  bytesToBase64,
  decryptData,
  deriveKey,
  encryptData,
  isKeyDerivation,
  openText,
  sealText,
  simpleDeobfuscate,
  simpleObfuscate
};
//# sourceMappingURL=cryptoHelper.js.map