import { base64To } from "misc-helpers";

// ------------------------------------------------------------------------------------------------
// Encrypted values in the format of 1.2.x ({ iv, data }), written as that version wrote them. The library still reads
// them (cryptoHelper.decryptData) but writes them no more since 1.3.0: the tests that check it reads them write them
// here.
// ------------------------------------------------------------------------------------------------

/** The bytes as a text of one character each — how 1.2.x turned them into text before base64 */
function bytesToBinary(bytes) {
  let text = "";
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

/**
 * Encrypts a value as 1.2.x did.
 * @param {CryptoKey} key - The AES key.
 * @param {any} dataObj - The data to encrypt.
 * @param {boolean} [raw=false] - If true, the raw bytes (not base64).
 * @returns {Promise<{ iv: string|Uint8Array, data: string|Uint8Array }>}
 */
export async function encryptData(key, dataObj, raw = false) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(dataObj));
  const encrypted = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded));
  if (raw) {
    return { iv, data: encrypted };
  }
  return { iv: base64To(bytesToBinary(iv)), data: base64To(bytesToBinary(encrypted)) };
}

// ------------------------------------------------------------------------------------------------
