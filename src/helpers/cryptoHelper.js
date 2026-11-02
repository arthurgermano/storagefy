import { logError, logInfo } from "./loggerHelper.js";
import { base64To, base64From } from "misc-helpers";

// ------------------------------------------------------------------------------------------------
// Encryption of stored values (AES-GCM, 256-bit keys, a random IV on every write).
//
// What it is for: it makes the values hard to read in the browser's tools. It does not keep a secret — everything
// needed to decrypt ships with the app (see the README, "Encryption").
//
// How the key is derived from the password (keyDerivation):
//   - "hkdf" (the default since 1.3.0): fast (well under a millisecond). Right when the password is a constant of the
//     app — stretching it would only slow the app down, since anyone who reads the app's code has the password
//   - "pbkdf2": 100,000 rounds, slow on purpose (milliseconds to tens of milliseconds per key). Right only when the
//     password is typed by the person (a PIN, a passphrase): then guessing it is what must be slow
//
// Formats of a stored value:
//   - since 1.3.0: { v: 2, kdf, iv, data } — standard base64 of the bytes; kdf says how the key was derived, so a value
//     is read the way it was written, whatever the adapter's option is now
//   - up to 1.2.x: { iv, data } — PBKDF2, and the bytes turned into text before base64. Still read (decryptData);
//     written again in the new format on the next write of the key
// ------------------------------------------------------------------------------------------------

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

/** The ways a key may be derived from the password */
export const KEY_DERIVATIONS = Object.freeze(["hkdf", "pbkdf2"]);

/** The key derivation of an adapter that does not choose one */
export const DEFAULT_KEY_DERIVATION = "hkdf";

/** The format of the values written since 1.3.0 */
export const ENVELOPE_VERSION = 2;

const PBKDF2_ITERATIONS = 100000;
/** Binds the HKDF keys to their use: the same password gives other keys anywhere else */
const HKDF_INFO = ENCODER.encode("storagefy:aes-gcm-256");
const IV_BYTES = 12;
/** Bytes turned into text a slice at a time: one call with every byte as an argument overflows on large values */
const BINARY_CHUNK = 0x8000;

// ------------------------------------------------------------------------------------------------

/**
 * The Web Crypto API — looked up on first use, not when the module loads: importing Storagefy does nothing by itself
 * ("sideEffects": false), and a page or runtime without it fails only when encryption is used. Browsers and Node ≥ 19
 * expose it as globalThis.crypto.
 * @private
 * @returns {Crypto}
 * @throws {Error} If the Web Crypto API is not available.
 */
function webCrypto() {
  const crypto = globalThis.crypto;
  if (!crypto || !crypto.subtle) {
    logError("CryptoHelper - Web Crypto API not available");
    throw new Error("Crypto API not available");
  }
  return crypto;
}

// ------------------------------------------------------------------------------------------------

/**
 * Whether a value names a key derivation Storagefy knows.
 * @param {unknown} value
 * @returns {value is "hkdf" | "pbkdf2"}
 */
export function isKeyDerivation(value) {
  return KEY_DERIVATIONS.includes(value);
}

// ------------------------------------------------------------------------------------------------

/**
 * The bytes as one text character each (codes 0–255), built a slice at a time.
 * @private
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBinary(bytes) {
  let binary = "";
  for (let start = 0; start < bytes.length; start += BINARY_CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(start, start + BINARY_CHUNK));
  }
  return binary;
}

// ------------------------------------------------------------------------------------------------

/**
 * Standard base64 of bytes — any size.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
  return btoa(bytesToBinary(bytes));
}

// ------------------------------------------------------------------------------------------------

/**
 * The bytes of standard base64.
 * @param {string} text
 * @returns {Uint8Array}
 * @throws {Error} If the text is not base64.
 */
export function base64ToBytes(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

// ------------------------------------------------------------------------------------------------

/**
 * Derives an AES-GCM key from a password and a salt.
 * @param {string} password - The password.
 * @param {string} [salt] - The salt (the storage key, for the adapters).
 * @param {boolean} [extractable=false] - Whether the derived key is extractable.
 * @param {"hkdf"|"pbkdf2"} [keyDerivation="pbkdf2"] - How (see the top of this file). The default stays PBKDF2 for
 *   callers of this helper; the adapters pass their own option.
 * @returns {Promise<CryptoKey>} The derived key.
 * @throws {Error} If the password is not a non-empty string, or the key derivation is unknown.
 */
export const deriveKey = async (password, salt, extractable = false, keyDerivation = "pbkdf2") => {
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
      ["deriveKey"],
    );
    const algorithm =
      keyDerivation === "hkdf"
        ? { name: "HKDF", hash: "SHA-256", salt: ENCODER.encode(salt ?? ""), info: HKDF_INFO }
        : { name: "PBKDF2", hash: "SHA-256", salt: ENCODER.encode(salt), iterations: PBKDF2_ITERATIONS };
    return await subtle.deriveKey(algorithm, keyMaterial, { name: "AES-GCM", length: 256 }, extractable, [
      "encrypt",
      "decrypt",
    ]);
  } catch (error) {
    logError("Error deriving key:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Encrypts a text in the format written since 1.3.0.
 * @param {CryptoKey} key - The AES key.
 * @param {string} text - What to encrypt.
 * @param {"hkdf"|"pbkdf2"} keyDerivation - How the key was derived — recorded so the value is read the same way.
 * @returns {Promise<{ v: 2, kdf: "hkdf"|"pbkdf2", iv: string, data: string }>}
 * @throws {Error} If encryption fails (e.g. not an AES-GCM key).
 */
export async function sealText(key, text, keyDerivation) {
  const iv = webCrypto().getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await webCrypto().subtle.encrypt({ name: "AES-GCM", iv }, key, ENCODER.encode(text));
  const data = bytesToBase64(new Uint8Array(encrypted));
  return { v: ENVELOPE_VERSION, kdf: keyDerivation, iv: bytesToBase64(iv), data };
}

// ------------------------------------------------------------------------------------------------

/**
 * Decrypts a text written by sealText.
 * @param {CryptoKey} key - The AES key.
 * @param {{ iv: string, data: string }} envelope - What sealText returned.
 * @returns {Promise<string>}
 * @throws {Error} If it does not decrypt with this key (another key, or the value was changed).
 */
export async function openText(key, envelope) {
  const decrypted = await webCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    key,
    base64ToBytes(envelope.data),
  );
  return DECODER.decode(decrypted);
}

// ------------------------------------------------------------------------------------------------

/**
 * Decrypts data in the format of 1.2.x ({ iv, data }) — values written before 1.3.0 are read with it.
 * @param {CryptoKey} key - The AES key.
 * @param {{ iv: string|Uint8Array, data: string|Uint8Array }} encryptedObj - Encrypted data.
 * @param {boolean} [raw=false] - Whether the encrypted data is in raw format.
 * @returns {Promise<any>} The decrypted original data.
 * @throws {Error} If it does not decrypt with this key.
 */
export const decryptData = async (key, encryptedObj, raw = false) => {
  try {
    logInfo("CryptoHelper - Decrypting data", { raw });
    // Up to 1.2.x the bytes were turned into text and that text into base64: reversed the same way
    const decode = (value) =>
      raw ? new Uint8Array(value) : Uint8Array.from(base64From(value), (char) => char.charCodeAt(0));
    const decrypted = await webCrypto().subtle.decrypt(
      { name: "AES-GCM", iv: decode(encryptedObj.iv) },
      key,
      decode(encryptedObj.data),
    );
    return JSON.parse(DECODER.decode(decrypted));
  } catch (error) {
    logError("Error decrypting data:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/** The code points a key name may hold: up to U+10FFFF, without the surrogates (U+D800–U+DFFF, never alone) */
const MAX_CODE_POINT = 0x10ffff;
const SURROGATES = { first: 0xd800, last: 0xdfff };

/**
 * A code point moved by one, skipping the surrogates and wrapping at the ends — a one-to-one map of the code points a
 * text may hold, so every key name keeps a name of its own.
 * @private
 * @param {number} codePoint
 * @param {1|-1} step
 * @returns {number}
 */
function shiftCodePoint(codePoint, step) {
  let next = codePoint + step;
  if (next >= SURROGATES.first && next <= SURROGATES.last) {
    next += step * (SURROGATES.last - SURROGATES.first + 1);
  }
  if (next > MAX_CODE_POINT) return 0;
  if (next < 0) return MAX_CODE_POINT;
  return next;
}

// ------------------------------------------------------------------------------------------------

/**
 * Applies a simple obfuscation to a string (each character moved by one, then base64) — keeps key names out of plain
 * sight. Not encryption.
 *
 * By character (code point): up to 1.3.0 by UTF-16 unit, which dropped the second half of a character outside the
 * BMP (an emoji) — "fav-😀" and "fav-😁" became the same stored key. Names of BMP characters only are obfuscated as
 * before.
 * @param {string} str - The input string to obfuscate.
 * @returns {string} The obfuscated string.
 */
export function simpleObfuscate(str) {
  if (!str) return str;
  logInfo("CryptoHelper - Obfuscating string");
  const shifted = [...str].map((char) => String.fromCodePoint(shiftCodePoint(char.codePointAt(0), 1))).join("");
  return base64To(shifted);
}

// ------------------------------------------------------------------------------------------------

/**
 * Reverses simpleObfuscate.
 * @param {string} str - The obfuscated string to restore.
 * @returns {string} The original string.
 */
export function simpleDeobfuscate(str) {
  if (!str) return str;
  logInfo("CryptoHelper - Deobfuscating string");
  const decoded = base64From(str);
  return [...decoded].map((char) => String.fromCodePoint(shiftCodePoint(char.codePointAt(0), -1))).join("");
}

// ------------------------------------------------------------------------------------------------
