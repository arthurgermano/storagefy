import { describe, it, expect, afterEach } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll } from "../__fixtures__/storages.js";

// ------------------------------------------------------------------------------------------------
// has(key) answers whether get(key) would find a value: an expired key is not there, even before the watcher removes
// it. Up to 1.3.0 has() answered true for an expired key until the watcher (or a get) removed it — with the watcher
// off (expireCheckInterval: 0), forever.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  closeAll();
});

describe.each(STORAGE_NAMES)("%s — has", (name) => {
  it("answers false for an expired key the watcher has not removed yet — and leaves it for get to remove", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("session", { validUntil: 1 });
    await adapter.setExpire("session", Date.now() - 1);

    expect(await adapter.has("session")).toBe(false);
    expect(await adapter.getExpire("session")).not.toBeNull();
    expect(await adapter.get("session")).toBeNull();
    expect(await adapter.getExpire("session")).toBeNull();
  });

  it("answers true for a key that expires later", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("session", { validUntil: 1 }, 60_000);

    expect(await adapter.has("session")).toBe(true);
  });

  it("answers false for an expiration without a value", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.setExpire("session", Date.now() + 60_000);

    expect(await adapter.has("session")).toBe(false);
  });
});
