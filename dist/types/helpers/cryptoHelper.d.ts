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
export function encryptKey(key: string): string;
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
export function simpleObfuscate(str: string): string;
/**
 * Reverses a previously obfuscated string:
 * 1. Decodes from base64 using `base64From()`.
 * 2. Shifts each character code by -1 to restore the original.
 *
 * @param {string} str - The obfuscated string to restore.
 * @returns {string} The original (deobfuscated) string.
 * @throws {Error} If the deobfuscation process fails.
 */
export function simpleDeobfuscate(str: string): string;
export function deriveKey(password: string, salt: string, extractable?: boolean): Promise<CryptoKey>;
export function encryptData(key: CryptoKey, dataObj: any, raw?: boolean): Promise<any>;
export function decryptData(key: CryptoKey, encryptedObj: any, raw?: boolean): Promise<any>;
