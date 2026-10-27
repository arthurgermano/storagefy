import { logError, logInfo } from "./loggerHelper.js";
import { base64To, base64From } from "misc-helpers";
const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();
function webCrypto() {
  const crypto = globalThis.crypto;
  if (!crypto || !crypto.subtle) {
    logError("CryptoHelper - Web Crypto API not available");
    throw new Error("Crypto API not available");
  }
  return crypto;
}
const generateKeyMaterial = async (password) => {
  try {
    logInfo("CryptoHelper - Generating key material from password");
    return webCrypto().subtle.importKey("raw", ENCODER.encode(password), "PBKDF2", false, [
      "deriveKey"
    ]);
  } catch (error) {
    logError("Error generating key material:", error);
    throw error;
  }
};
const deriveKey = async (password, salt, extractable = false) => {
  try {
    if (typeof password !== "string" || !password.length) {
      throw new Error("Invalid password");
    }
    logInfo("CryptoHelper - Deriving key with PBKDF2", {
      passwordLength: password.length,
      extractable
    });
    const keyMaterial = await generateKeyMaterial(password);
    return webCrypto().subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: ENCODER.encode(salt),
        iterations: 1e5,
        hash: "SHA-256"
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
const encryptData = async (key, dataObj, raw = false) => {
  if (dataObj === void 0 || typeof dataObj === "function" || typeof dataObj === "symbol") {
    throw new Error("Invalid data type for encryption");
  }
  try {
    logInfo("CryptoHelper - Encrypting data", { raw });
    const iv = webCrypto().getRandomValues(new Uint8Array(12));
    const encoded = ENCODER.encode(JSON.stringify(dataObj));
    const encrypted = await webCrypto().subtle.encrypt(
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
const decryptData = async (key, encryptedObj, raw = false) => {
  let iv, encrypted;
  try {
    logInfo("CryptoHelper - Decrypting data", { raw });
    if (raw) {
      iv = new Uint8Array(encryptedObj.iv);
      encrypted = new Uint8Array(encryptedObj.data);
    } else {
      const decodeBase64 = (b64) => new Uint8Array(
        base64From(b64).split("").map((char) => char.charCodeAt(0))
      );
      iv = decodeBase64(encryptedObj.iv);
      encrypted = decodeBase64(encryptedObj.data);
    }
    const decrypted = await webCrypto().subtle.decrypt(
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
function encryptKey(key) {
  try {
    if (!key) {
      return key;
    }
    return this.simpleObfuscate(key);
  } catch (error) {
    logError("Error in encryptKey:", error);
    throw error;
  }
}
function simpleObfuscate(str) {
  if (!str) return str;
  logInfo("CryptoHelper - Obfuscating string");
  try {
    const shifted = [...str].map((char) => String.fromCharCode(char.charCodeAt(0) + 1)).join("");
    return base64To(shifted);
  } catch (error) {
    return str;
  }
}
function simpleDeobfuscate(str) {
  if (!str) return str;
  logInfo("CryptoHelper - Deobfuscating string");
  try {
    const decoded = base64From(str);
    return [...decoded].map((char) => String.fromCharCode(char.charCodeAt(0) - 1)).join("");
  } catch (error) {
    return str;
  }
}
export {
  decryptData,
  deriveKey,
  encryptData,
  encryptKey,
  simpleDeobfuscate,
  simpleObfuscate
};
//# sourceMappingURL=cryptoHelper.js.map