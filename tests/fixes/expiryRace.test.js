import { describe, it, expect, afterEach, vi } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll } from "../__fixtures__/storages.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";

const IndexedDBAdapterWithStore = IndexedDBAdapter.prototype._withStore;

// ------------------------------------------------------------------------------------------------
// An expired key is removed only if it is still expired when its turn in the key's queue comes. Up to the first 1.3.0
// build, a read (or the expiry watcher) that saw the old, expired value queued a delete behind a write already asked
// — with a new expiration — and the delete removed the value just written: set answered true, the value was gone.
// A read also waits for the writes of its key asked before it: what was written is what is read.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

const CASES = STORAGE_NAMES.flatMap((name) => [
  [name, "plain", {}],
  [name, "encrypted", { encrypt: true, password: "app-secret" }],
]);

/** An adapter whose "session" key has expired, with the watcher off: nothing removed it yet */
async function expiredSession(name, options) {
  freshStorage(name);
  const adapter = openStorage(name, options);
  await adapter.set("session", { validUntil: 1 });
  await adapter.setExpire("session", Date.now() - 1);
  return adapter;
}

describe.each(CASES)("%s (%s) — an expired key and a write asked before it is removed", (name, _case, options) => {
  it("a read that saw the old value keeps the value written", async () => {
    const adapter = await expiredSession(name, options);

    const written = adapter.set("session", { validUntil: 2 }, 60_000);
    const read = adapter.get("session");

    expect(await written).toBe(true);
    expect(await read).toEqual({ validUntil: 2 });
    expect(await adapter.get("session")).toEqual({ validUntil: 2 });
    expect(await adapter.getExpire("session")).toBeGreaterThan(Date.now());
  });

  it("the expiry watcher that saw the old expiration keeps the value written", async () => {
    const adapter = await expiredSession(name, options);

    const written = adapter.set("session", { validUntil: 2 }, 60_000);
    const swept = adapter.clearExpire();

    expect(await written).toBe(true);
    await swept;
    expect(await adapter.get("session")).toEqual({ validUntil: 2 });
  });

  it("a write without expiration keeps its value too", async () => {
    const adapter = await expiredSession(name, options);

    const written = adapter.set("session", { validUntil: 2 });
    const swept = adapter.clearExpire();

    expect(await written).toBe(true);
    await swept;
    expect(await adapter.get("session")).toEqual({ validUntil: 2 });
    expect(await adapter.getExpire("session")).toBeNull();
  });

  it("a key still expired is removed — and the other tabs are told", async () => {
    const adapter = await expiredSession(name, { ...options, channelName: `race_${Math.random()}`, enableSyncTabs: true });
    const told = vi.spyOn(adapter, "emitDataChange");

    await adapter.clearExpire();

    expect(await adapter.has("session")).toBe(false);
    expect(await adapter.getExpire("session")).toBeNull();
    expect(told).toHaveBeenCalledWith("session", undefined, "delete");
  });
});

describe.each(STORAGE_NAMES)("%s — a read after a write not awaited", (name) => {
  it("get and has see the write", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });

    void adapter.set("theme", "dark");
    const read = adapter.get("theme");
    const found = adapter.has("theme");

    expect([await read, await found]).toEqual(["dark", true]);
  });

  it("an expired key removed meanwhile is not removed again (nothing told to the other tabs)", async () => {
    const adapter = await expiredSession(name, { channelName: `race_${Math.random()}`, enableSyncTabs: true });
    await adapter.delete("session");
    const told = vi.spyOn(adapter, "emitDataChange");

    await adapter._expire("session");

    expect(told).not.toHaveBeenCalled();
  });
});

describe.each(STORAGE_NAMES)("%s — an expiration that cannot be removed", (name) => {
  it("is logged, never thrown: the read still answers null", async () => {
    const adapter = await expiredSession(name, {});
    if (name === "IndexedDBAdapter") {
      vi.spyOn(adapter, "_withStore").mockImplementation(async (mode, callback) => {
        if (mode === "readwrite") throw new Error("storage gone");
        return IndexedDBAdapterWithStore.call(adapter, mode, callback);
      });
    } else {
      vi.spyOn(adapter._storage, "removeItem").mockImplementation(() => {
        throw new Error("storage gone");
      });
    }

    expect(await adapter.get("session")).toBeNull();
    await expect(adapter._expire("session")).resolves.toBeUndefined();
  });
});
