import { base64To } from "misc-helpers";
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  deriveKey,
  encryptData,
  decryptData,
  generateSalt,
  generateKeyMaterial,
} from "../src/helpers/cryptoHelper.js";

// ------------------------------------------------------------------------------------------------

const TEST_PASSWORD = "MyS3cur3P@ssw0rd!";
const TEST_SALT = "randomSalt123";
const TEST_OBJECT = { name: "ContinuumDB", secure: true };

// ------------------------------------------------------------------------------------------------

describe("CRYPTO HELPER", () => {
  // ------------------------------------------------------------------------------------------------

  describe("deriveKey", () => {
    it("should return a CryptoKey from password", async () => {
      const key = await deriveKey(TEST_PASSWORD);
      expect(key).toBeDefined();
      expect(key.constructor.name).toBe("CryptoKey");
    });

    // --------------------------------------------------------------------------------------------

    it("should throw on invalid input", async () => {
      await expect(deriveKey(null)).rejects.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should derive key with password containing unicode and symbols", async () => {
      const key = await deriveKey("✓𓂀🧠✨!@#");
      expect(key).toBeDefined();
    });

    // --------------------------------------------------------------------------------------------

    it("should return a CryptoKey from password", async () => {
      const key = await deriveKey(TEST_PASSWORD, TEST_SALT);
      expect(key).toBeDefined();
      expect(key.constructor.name).toBe("CryptoKey");
    });

    // --------------------------------------------------------------------------------------------

    it("should throw on null password", async () => {
      await expect(deriveKey(null, TEST_SALT)).rejects.toThrow(
        "Invalid password"
      );
    });

    // --------------------------------------------------------------------------------------------

    it("should throw on empty string password", async () => {
      await expect(deriveKey("", TEST_SALT)).rejects.toThrow(
        "Invalid password"
      );
    });

    // --------------------------------------------------------------------------------------------

    it("should throw on non-string password", async () => {
      await expect(deriveKey(123456, TEST_SALT)).rejects.toThrow(
        "Invalid password"
      );
    });

    // --------------------------------------------------------------------------------------------

    it("should derive key even with empty salt", async () => {
      const key = await deriveKey(TEST_PASSWORD, "");
      expect(key).toBeDefined();
      expect(key.constructor.name).toBe("CryptoKey");
    });

    // --------------------------------------------------------------------------------------------

    it("should derive different keys for different salts", async () => {
      const key1 = await deriveKey(TEST_PASSWORD, "salt1", true);
      const key2 = await deriveKey(TEST_PASSWORD, "salt2", true);

      const exported1 = await crypto.subtle.exportKey("raw", key1);
      const exported2 = await crypto.subtle.exportKey("raw", key2);

      expect(Buffer.from(exported1)).not.toEqual(Buffer.from(exported2));
    });

    // --------------------------------------------------------------------------------------------

    it("should derive same key from same password and salt", async () => {
      const key1 = await deriveKey(TEST_PASSWORD, TEST_SALT, true);
      const key2 = await deriveKey(TEST_PASSWORD, TEST_SALT, true);

      const exported1 = await crypto.subtle.exportKey("raw", key1);
      const exported2 = await crypto.subtle.exportKey("raw", key2);

      expect(Buffer.from(exported1)).toEqual(Buffer.from(exported2));
    });

    // --------------------------------------------------------------------------------------------

    it("should handle passwords with non-Latin characters", async () => {
      const key = await deriveKey("パスワード🔐", TEST_SALT);
      expect(key).toBeDefined();
    });

    // --------------------------------------------------------------------------------------------

    it("should handle long passwords and salts", async () => {
      const longPassword = "A".repeat(1000);
      const longSalt = "SALT".repeat(1000);
      const key = await deriveKey(longPassword, longSalt);
      expect(key).toBeDefined();
    });

    // --------------------------------------------------------------------------------------------

    it("should throw if subtle.deriveKey fails internally (mocked)", async () => {
      const original = crypto.subtle.deriveKey;
      crypto.subtle.deriveKey = () => {
        throw new Error("deriveKey failure");
      };

      await expect(deriveKey(TEST_PASSWORD, TEST_SALT)).rejects.toThrow(
        "deriveKey failure"
      );

      crypto.subtle.deriveKey = original;
    });
  });

  // ------------------------------------------------------------------------------------------------

  describe("encryptData / decryptData", () => {
    let key;

    // --------------------------------------------------------------------------------------------

    beforeEach(async () => {
      key = await deriveKey(TEST_PASSWORD);
    });

    // --------------------------------------------------------------------------------------------

    it("should encrypt and decrypt with raw=false (default)", async () => {
      const encrypted = await encryptData(key, TEST_OBJECT);
      const decrypted = await decryptData(key, encrypted);
      expect(decrypted).toEqual(TEST_OBJECT);
      expect(typeof encrypted.iv).toBe("string");
      expect(typeof encrypted.data).toBe("string");
    });

    // --------------------------------------------------------------------------------------------

    it("should encrypt and decrypt with raw=true", async () => {
      const encrypted = await encryptData(key, TEST_OBJECT, true);
      const decrypted = await decryptData(key, encrypted, true);
      expect(decrypted).toEqual(TEST_OBJECT);
      expect(encrypted.iv).toBeInstanceOf(Uint8Array);
      expect(encrypted.data).toBeInstanceOf(Uint8Array);
    });

    // --------------------------------------------------------------------------------------------

    it("should throw on tampered IV", async () => {
      const encrypted = await encryptData(key, TEST_OBJECT, true);
      encrypted.iv[0] = (encrypted.iv[0] + 1) % 256; // Tamper IV
      await expect(decryptData(key, encrypted, true)).rejects.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should throw when using a different key to decrypt", async () => {
      const anotherKey = await deriveKey("AnotherPassword123!");
      const encrypted = await encryptData(key, TEST_OBJECT);
      await expect(decryptData(anotherKey, encrypted)).rejects.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should handle complex nested objects", async () => {
      const obj = {
        user: { id: 1, info: { name: "Ana", active: true } },
        roles: ["dev"],
      };
      const encrypted = await encryptData(key, obj);
      const decrypted = await decryptData(key, encrypted);
      expect(decrypted).toEqual(obj);
    });

    // --------------------------------------------------------------------------------------------

    it("should encrypt and decrypt string payload", async () => {
      const str = "Hello, Continuum!";
      const encrypted = await encryptData(key, str);
      const decrypted = await decryptData(key, encrypted);
      expect(decrypted).toBe(str);
    });

    // --------------------------------------------------------------------------------------------

    it("should encrypt and decrypt array payload", async () => {
      const arr = [1, 2, 3, 4, "a"];
      const encrypted = await encryptData(key, arr);
      const decrypted = await decryptData(key, encrypted);
      expect(decrypted).toEqual(arr);
    });

    // --------------------------------------------------------------------------------------------

    it("should throw if missing iv or data fields", async () => {
      const invalid1 = { iv: "123" }; // missing data
      const invalid2 = { data: "abc" }; // missing iv
      await expect(decryptData(key, invalid1)).rejects.toThrow();
      await expect(decryptData(key, invalid2)).rejects.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should throw if encryptData receives an invalid key", async () => {
      await expect(encryptData(null, TEST_OBJECT)).rejects.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should throw if decrypted data is not valid JSON", async () => {
      const key = await deriveKey(TEST_PASSWORD);
      const encoded = new TextEncoder().encode("this is not json");
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        encoded
      );

      const malformed = {
        iv: base64To(String.fromCharCode(...iv)),
        data: base64To(String.fromCharCode(...new Uint8Array(encrypted))),
      };

      // corromper um pouco os dados para evitar um JSON válido
      malformed.data = malformed.data.slice(0, -2);

      await expect(decryptData(key, malformed)).rejects.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should throw if encrypting undefined", async () => {
      const key = await deriveKey(TEST_PASSWORD);
      await expect(encryptData(key, undefined)).rejects.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should throw if encrypting a function", async () => {
      const key = await deriveKey(TEST_PASSWORD);
      await expect(encryptData(key, () => {})).rejects.toThrow();
    });

    // --------------------------------------------------------------------------------------------

    it("should throw if encrypting a symbol", async () => {
      const key = await deriveKey(TEST_PASSWORD);
      await expect(encryptData(key, Symbol("fail"))).rejects.toThrow();
    });
  });

  // ----------------------------------------------------------------------------------------------
});
