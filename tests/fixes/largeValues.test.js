import { describe, it, expect, afterEach } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll } from "../__fixtures__/storages.js";

// ------------------------------------------------------------------------------------------------
// A large value is encrypted like a small one. Up to 1.2.x the encrypted bytes were turned into text with one call
// taking every byte as an argument, which overflows past ~100 KB: the write failed.
// ------------------------------------------------------------------------------------------------

afterEach(closeAll);

describe.each(STORAGE_NAMES)("%s — large values, encrypted", (name) => {
  it("stores and reads back a value of 1 MB", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });
    const value = { text: "çã✓".repeat(350_000) };

    expect(await adapter.set("big", value)).toBe(true);
    expect(await adapter.get("big")).toEqual(value);
  });
});
