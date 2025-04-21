import { logError, logWarn, logInfo } from "./loggerHelper.js";
import base64To from "misc-helpers/src/utils/base64To.js";
import base64From from "misc-helpers/src/utils/base64From.js";

// ------------------------------------------------------------------------------------------------

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

// ------------------------------------------------------------------------------------------------

let crypto;
let subtle;

// ------------------------------------------------------------------------------------------------

/**
 * Initializes the Web Crypto API depending on environment (Browser or Node).
 * @async
 * @throws Will throw an error if crypto is not available in the environment.
 */
async function getCrypto() {
  try {
    logInfo("CryptoHelper - Attempting to initialize crypto engine");

    if (typeof window !== "undefined" && window.crypto) {
      crypto = window.crypto;
      subtle = crypto.subtle;
      logInfo("CryptoHelper - Crypto initialized from window.crypto");
      return;
    }

    if (typeof global !== "undefined") {
      if (globalThis.crypto?.webcrypto) {
        crypto = globalThis.crypto.webcrypto;
        subtle = crypto.subtle;
        logInfo("CryptoHelper - Crypto initialized from globalThis.webcrypto");
        return;
      }
    }

    throw new Error("Crypto API not available");
  } catch (error) {
    logError("Failed to initialize crypto:", error);
    throw error;
  }
}

try {
  await getCrypto();
} catch (error) {
  logError("Failed to initialize crypto:", error);
}

// ------------------------------------------------------------------------------------------------

/**
 * Creates a key material from a password to be used in key derivation.
 * @private
 * @param {string} password - The password to convert.
 * @returns {Promise<CryptoKey>} A CryptoKey representing the key material.
 */
const generateKeyMaterial = async (password) => {
  try {
    logInfo("CryptoHelper - Generating key material from password");
    return subtle.importKey("raw", ENCODER.encode(password), "PBKDF2", false, [
      "deriveKey",
    ]);
  } catch (error) {
    logError("Error generating key material:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Derives a cryptographic key using PBKDF2 from a password and salt.
 * @param {string} password - The password.
 * @param {string} salt - The salt.
 * @param {boolean} [extractable=false] - Whether the derived key is extractable.
 * @returns {Promise<CryptoKey>} The derived key.
 */
export const deriveKey = async (password, salt, extractable = false) => {
  try {
    if (typeof password !== "string" || !password.length) {
      throw new Error("Invalid password");
    }
    logInfo("CryptoHelper - Deriving key with PBKDF2", {
      passwordLength: password.length,
      extractable,
    });
    const keyMaterial = await generateKeyMaterial(password);
    return subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: ENCODER.encode(salt),
        iterations: 100000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      extractable,
      ["encrypt", "decrypt"]
    );
  } catch (error) {
    logError("Error deriving key:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Encrypts a JavaScript object using AES-GCM.
 * @param {CryptoKey} key - The AES key.
 * @param {any} dataObj - The data to encrypt.
 * @param {boolean} [raw=false] - If true, returns raw bytes.
 * @returns {Promise<Object>} The encrypted data (base64 or raw format).
 */
export const encryptData = async (key, dataObj, raw = false) => {
  if (
    dataObj === undefined ||
    typeof dataObj === "function" ||
    typeof dataObj === "symbol"
  ) {
    throw new Error("Invalid data type for encryption");
  }

  try {
    logInfo("CryptoHelper - Encrypting data", { raw });
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = ENCODER.encode(JSON.stringify(dataObj));
    const encrypted = await subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoded
    );

    if (raw) {
      return { iv, data: new Uint8Array(encrypted) };
    }

    const ivBase64 = base64To(String.fromCharCode(...iv));
    const encryptedBase64 = base64To(
      String.fromCharCode(...new Uint8Array(encrypted))
    );

    return { iv: ivBase64, data: encryptedBase64 };
  } catch (error) {
    logError("Error encrypting data:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Decrypts encrypted data using AES-GCM.
 * @param {CryptoKey} key - The AES key.
 * @param {Object} encryptedObj - Encrypted data.
 * @param {boolean} [raw=false] - Whether the encrypted data is in raw format.
 * @returns {Promise<any>} The decrypted original data.
 */
export const decryptData = async (key, encryptedObj, raw = false) => {
  let iv, encrypted;

  try {
    logInfo("CryptoHelper - Decrypting data", { raw });

    if (raw) {
      iv = new Uint8Array(encryptedObj.iv);
      encrypted = new Uint8Array(encryptedObj.data);
    } else {
      const decodeBase64 = (b64) =>
        new Uint8Array(
          base64From(b64)
            .split("")
            .map((char) => char.charCodeAt(0))
        );
      iv = decodeBase64(encryptedObj.iv);
      encrypted = decodeBase64(encryptedObj.data);
    }

    const decrypted = await subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );

    return JSON.parse(DECODER.decode(decrypted));
  } catch (error) {
    logError("Error decrypting data:", error);
    throw error;
  }
};

// ------------------------------------------------------------------------------------------------

/**
 * Encrypts (obfuscates) a string key using a simple transformation.
 * This is not a secure encryption method and is intended only for light obfuscation
 * (e.g., hiding keys in client-side storage from plain sight).
 *
 * Internally uses `simpleObfuscate()` to perform a base64 + character shift.
 *
 * @param {string} key - The key to obfuscate.
 * @returns {string} The obfuscated key.
 * @throws {Error} If obfuscation fails.
 */
export function encryptKey(key) {
  try {
    if (!key) {
      return key;
    }

    // Light obfuscation using character shifting + base64
    return this.simpleObfuscate(key);
  } catch (error) {
    logError("Error in encryptKey:", error);
    throw error;
  }
}

// ------------------------------------------------------------------------------------------------

/**
 * Applies a simple obfuscation to a string:
 * 1. Shifts each character code by +1.
 * 2. Converts the result to base64 format using `base64To()`.
 *
 * This is useful for making strings less readable, though not secure.
 *
 * @param {string} str - The input string to obfuscate.
 * @returns {string} The obfuscated string.
 * @throws {Error} If the obfuscation process fails.
 */
export function simpleObfuscate(str) {
  if (!str) return str;

  logInfo("CryptoHelper - Obfuscating string");

  try {
    // Shift each character's char code by +1
    const shifted = [...str]
      .map((char) => String.fromCharCode(char.charCodeAt(0) + 1))
      .join("");

    // Convert to base64
    return base64To(shifted);
  } catch (error) {
    return str;
  }
}

// ------------------------------------------------------------------------------------------------

/**
 * Reverses a previously obfuscated string:
 * 1. Decodes from base64 using `base64From()`.
 * 2. Shifts each character code by -1 to restore the original.
 *
 * @param {string} str - The obfuscated string to restore.
 * @returns {string} The original (deobfuscated) string.
 * @throws {Error} If the deobfuscation process fails.
 */
export function simpleDeobfuscate(str) {
  if (!str) return str;

  logInfo("CryptoHelper - Deobfuscating string");

  try {
    // Decode base64
    const decoded = base64From(str);

    // Shift each character's char code back by -1
    return [...decoded]
      .map((char) => String.fromCharCode(char.charCodeAt(0) - 1))
      .join("");
  } catch (error) {
    return str;
  }
}

// ------------------------------------------------------------------------------------------------
