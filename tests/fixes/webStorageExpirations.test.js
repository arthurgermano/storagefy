import { describe, it, expect, afterEach, vi } from "vitest";
import { freshStorage, openStorage, closeAll } from "../__fixtures__/storages.js";

// ------------------------------------------------------------------------------------------------
// localStorage and sessionStorage: a write without expiration leaves the expirations record alone. Up to 1.2.x every
// write read and wrote it again — work for nothing, and with localStorage shared by the tabs, a race with another
// tab writing an expiration at the same time.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

describe.each([
  ["LocalStorageAdapter", () => globalThis.localStorage],
  ["SessionStorageAdapter", () => globalThis.sessionStorage],
])("%s — the expirations record", (name, storage) => {
  it("is not written by a write without expiration of a key that had none", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    const writes = vi.spyOn(storage(), "setItem");

    await adapter.set("cart", { items: 1 });

    expect(writes.mock.calls.map(([key]) => key)).toEqual([adapter._fullKey("cart")]);
  });

  it("drops the expiration of a key written again without one", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 }, 60_000);

    await adapter.set("cart", { items: 2 });

    expect(await adapter.getExpire("cart")).toBeNull();
    expect(await adapter.get("cart")).toEqual({ items: 2 });
  });
});
