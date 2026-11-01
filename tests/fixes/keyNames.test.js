import { describe, it, expect, afterEach } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll } from "../__fixtures__/storages.js";
import * as cryptoHelper from "../../src/helpers/cryptoHelper.js";

// ------------------------------------------------------------------------------------------------
// The names of the keys, obfuscated when encrypting: every name keeps a stored name of its own. Up to the first 1.3.0
// build the obfuscation moved each UTF-16 unit of a character and dropped the second unit of a character outside the
// BMP: "fav-😀" and "fav-😁" became the same stored key — the second write replaced the first, which then did not
// decrypt, and list() found neither.
// ------------------------------------------------------------------------------------------------

afterEach(async () => {
  await closeAll();
});

describe.each(STORAGE_NAMES)("%s — encrypted keys with characters outside the BMP", (name) => {
  it("are stored apart, read back, listed and reset", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });

    await adapter.set("fav-😀", "smile");
    await adapter.set("fav-😁", "grin");

    expect([await adapter.get("fav-😀"), await adapter.get("fav-😁")]).toEqual(["smile", "grin"]);
    expect((await adapter.list("fav-")).map(({ key }) => key).sort()).toEqual(["fav-😀", "fav-😁"]);
    await adapter.reset();
    expect(await adapter.list()).toEqual([]);
  });
});

describe("simpleObfuscate", () => {
  it.each([
    ["ASCII", "testDB__cart"],
    ["accents and CJK", "ção-ñ-日本"],
    ["emoji", "fav-😀"],
    ["the last code point", "\u{10FFFF}x"],
    ["the code point before the surrogates", "\uD7FFa"],
    ["the code point after the surrogates", "\uE000"],
    ["U+0000", "\u0000z"],
    ["U+FFFF", "a\uFFFF"],
  ])("round-trips %s", (_case, text) => {
    expect(cryptoHelper.simpleDeobfuscate(cryptoHelper.simpleObfuscate(text))).toBe(text);
  });

  it("gives every name a stored name of its own", () => {
    const names = ["fav-😀", "fav-😁", "\u{10FFFF}", "\u0000", "\uD7FF", "\uE000", "a", "b"];
    expect(new Set(names.map(cryptoHelper.simpleObfuscate)).size).toBe(names.length);
  });

  it("keeps the stored names of BMP keys as they were — values stored before are still found", () => {
    // Computed with the simpleObfuscate of the published 1.2.0
    expect(cryptoHelper.simpleObfuscate("testDB__cart")).toBe("dWZ0dUVDYGBkYnN1");
    expect(cryptoHelper.simpleObfuscate("ção-ñ")).toBe("w6jDpHAuw7I");
  });
});
