import { describe, it, expect, afterEach, vi } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, readRaw, writeRaw, encryptedLike120 } from "../__fixtures__/storages.js";
import * as cryptoHelper from "../../src/helpers/cryptoHelper.js";

// ------------------------------------------------------------------------------------------------
// keyDerivation (1.3.0): how the encryption keys are derived from the password — "hkdf" (the default, fast) or
// "pbkdf2" (slow on purpose, for a password the person types). Each value records how it was written and is read
// that way, whatever the option is now; a value written by 1.2.x (no record: PBKDF2) still opens.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

describe.each(STORAGE_NAMES)("%s — keyDerivation", (name) => {
  it("derives with HKDF by default", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });
    await adapter.set("theme", "dark");
    expect(JSON.parse(await readRaw(adapter, "theme"))).toMatchObject({ v: 2, kdf: "hkdf" });
  });

  it("derives with PBKDF2 when asked", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret", keyDerivation: "pbkdf2" });
    await adapter.set("theme", "dark");
    expect(JSON.parse(await readRaw(adapter, "theme"))).toMatchObject({ v: 2, kdf: "pbkdf2" });
    expect(await adapter.get("theme")).toBe("dark");
  });

  it("reads a value the way it was written — the option may have changed since", async () => {
    freshStorage(name);
    await openStorage(name, { encrypt: true, password: "app-secret", keyDerivation: "pbkdf2" }).set("theme", "dark");
    await openStorage(name, { encrypt: true, password: "app-secret" }).set("lang", "pt");

    const hkdf = openStorage(name, { encrypt: true, password: "app-secret" });
    const pbkdf2 = openStorage(name, { encrypt: true, password: "app-secret", keyDerivation: "pbkdf2" });

    expect([await hkdf.get("theme"), await hkdf.get("lang")]).toEqual(["dark", "pt"]);
    expect([await pbkdf2.get("theme"), await pbkdf2.get("lang")]).toEqual(["dark", "pt"]);
  });

  it.each([
    ["with the password", "app-secret"],
    ["without a password", undefined],
  ])("opens a value 1.2.x wrote %s", async (_case, password) => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password });
    await writeRaw(adapter, "session", await encryptedLike120("session", { validUntil: 9 }, password));

    expect(await adapter.get("session")).toEqual({ validUntil: 9 });
  });

  it("works without a password too", async () => {
    freshStorage(name);
    await openStorage(name, { encrypt: true }).set("theme", "dark");
    expect(await openStorage(name, { encrypt: true }).get("theme")).toBe("dark");
  });

  it.each([["md5"], [""], [42]])("refuses an unknown key derivation (%j)", (keyDerivation) => {
    freshStorage(name);
    expect(() => openStorage(name, { encrypt: true, keyDerivation })).toThrow(
      "Storagefy: keyDerivation must be one of hkdf, pbkdf2",
    );
  });

  it("does not open a value that names an unknown key derivation — onError says why", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });
    await adapter.set("theme", "dark");
    const stored = JSON.parse(await readRaw(adapter, "theme"));
    await writeRaw(adapter, "theme", JSON.stringify({ ...stored, kdf: "md5" }));
    const errors = [];

    expect(await adapter.get("theme", { onError: (error) => errors.push(error) })).toBeNull();
    expect(errors.map((error) => [error.message, error.cause.message])).toEqual([
      ['Storagefy: could not read "theme"', "Storagefy: unknown key derivation in stored value: md5"],
    ]);
  });
});

describe("deriveKey", () => {
  it("is deterministic per derivation, and the two derivations give different keys", async () => {
    const text = "the same text";
    const seal = async (derivation) =>
      cryptoHelper.sealText(await cryptoHelper.deriveKey("pw", "salt", false, derivation), text, derivation);
    const open = async (derivation, envelope) =>
      cryptoHelper.openText(await cryptoHelper.deriveKey("pw", "salt", false, derivation), envelope);

    const byHkdf = await seal("hkdf");
    expect(await open("hkdf", byHkdf)).toBe(text);
    await expect(open("pbkdf2", byHkdf)).rejects.toThrow();
  });

  it("refuses an unknown derivation", async () => {
    await expect(cryptoHelper.deriveKey("pw", "salt", false, "md5")).rejects.toThrow("Unknown key derivation: md5");
  });

  it("knows the two derivations", () => {
    expect(cryptoHelper.isKeyDerivation("hkdf")).toBe(true);
    expect(cryptoHelper.isKeyDerivation("pbkdf2")).toBe(true);
    expect(cryptoHelper.isKeyDerivation("sha1")).toBe(false);
  });
});

describe("base64 of bytes", () => {
  it("round-trips every byte value, and sizes past one slice", () => {
    const bytes = Uint8Array.from({ length: 0x8000 * 2 + 7 }, (_, index) => index % 256);
    expect(cryptoHelper.base64ToBytes(cryptoHelper.bytesToBase64(bytes))).toEqual(bytes);
  });
});
