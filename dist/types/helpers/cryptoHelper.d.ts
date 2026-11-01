/**
 * Whether a value names a key derivation Storagefy knows.
 * @param {unknown} value
 * @returns {value is "hkdf" | "pbkdf2"}
 */
export function isKeyDerivation(value: unknown): value is "hkdf" | "pbkdf2";
/**
 * Standard base64 of bytes — any size.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes: Uint8Array): string;
/**
 * The bytes of standard base64.
 * @param {string} text
 * @returns {Uint8Array}
 * @throws {Error} If the text is not base64.
 */
export function base64ToBytes(text: string): Uint8Array;
/**
 * Encrypts a text in the format written since 1.3.0.
 * @param {CryptoKey} key - The AES key.
 * @param {string} text - What to encrypt.
 * @param {"hkdf"|"pbkdf2"} keyDerivation - How the key was derived — recorded so the value is read the same way.
 * @returns {Promise<{ v: 2, kdf: "hkdf"|"pbkdf2", iv: string, data: string }>}
 * @throws {Error} If encryption fails (e.g. not an AES-GCM key).
 */
export function sealText(key: CryptoKey, text: string, keyDerivation: "hkdf" | "pbkdf2"): Promise<{
    v: 2;
    kdf: "hkdf" | "pbkdf2";
    iv: string;
    data: string;
}>;
/**
 * Decrypts a text written by sealText.
 * @param {CryptoKey} key - The AES key.
 * @param {{ iv: string, data: string }} envelope - What sealText returned.
 * @returns {Promise<string>}
 * @throws {Error} If it does not decrypt with this key (another key, or the value was changed).
 */
export function openText(key: CryptoKey, envelope: {
    iv: string;
    data: string;
}): Promise<string>;
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
export function simpleObfuscate(str: string): string;
/**
 * Reverses simpleObfuscate.
 * @param {string} str - The obfuscated string to restore.
 * @returns {string} The original string.
 */
export function simpleDeobfuscate(str: string): string;
/** The ways a key may be derived from the password */
export const KEY_DERIVATIONS: readonly string[];
/** The key derivation of an adapter that does not choose one */
export const DEFAULT_KEY_DERIVATION: "hkdf";
/** The format of the values written since 1.3.0 */
export const ENVELOPE_VERSION: 2;
export function deriveKey(password: string, salt?: string, extractable?: boolean, keyDerivation?: "hkdf" | "pbkdf2"): Promise<CryptoKey>;
export function encryptData(key: CryptoKey, dataObj: any, raw?: boolean): Promise<{
    iv: string | Uint8Array;
    data: string | Uint8Array;
}>;
export function decryptData(key: CryptoKey, encryptedObj: {
    iv: string | Uint8Array;
    data: string | Uint8Array;
}, raw?: boolean): Promise<any>;
