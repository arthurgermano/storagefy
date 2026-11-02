import { describe, it, expect, afterEach, vi } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, uniqueChannel, settle, writeRaw } from "../__fixtures__/storages.js";
import CrossTabChannel from "../../src/helpers/CrossTabChannel.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";
import { isNewerRevision, isRevision } from "../../src/adapters/StorageAdapter.js";

// ------------------------------------------------------------------------------------------------
// The revision of each write (1.4.0): kept beside the value — the value's format is the one of 1.3.0, which still
// reads it — in a record of the namespace, written with the value (with IndexedDB, in its transaction) and removed
// with it. See tabOrder.test.js for what the stores do with it.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

/** The revisions record as stored, raw */
async function rawRecord(adapter) {
  if (adapter instanceof IndexedDBAdapter) {
    return (await adapter._withStore("readonly", (store) => adapter._answerOf(store.get(adapter.revisionKey)))) ?? null;
  }
  return adapter._storage.getItem(adapter.revisionKey);
}

// ------------------------------------------------------------------------------------------------

describe("isRevision / isNewerRevision", () => {
  it("knows a revision from anything else", () => {
    expect(isRevision({ at: 1, by: "a" })).toBe(true);
    expect(isRevision({ at: 1 })).toBe(false);
    expect(isRevision({ at: "1", by: "a" })).toBe(false);
    expect(isRevision({ at: Infinity, by: "a" })).toBe(false);
    expect(isRevision(null)).toBe(false);
    expect(isRevision(undefined)).toBe(false);
  });

  it("orders by at, then by by — and anything is newer than nothing", () => {
    expect(isNewerRevision({ at: 2, by: "a" }, { at: 1, by: "z" })).toBe(true);
    expect(isNewerRevision({ at: 1, by: "z" }, { at: 2, by: "a" })).toBe(false);
    expect(isNewerRevision({ at: 1, by: "b" }, { at: 1, by: "a" })).toBe(true);
    expect(isNewerRevision({ at: 1, by: "a" }, { at: 1, by: "b" })).toBe(false);
    expect(isNewerRevision({ at: 1, by: "a" }, { at: 1, by: "a" })).toBe(false);
    expect(isNewerRevision({ at: 1, by: "a" }, undefined)).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------

describe.each(STORAGE_NAMES)("%s — the revisions record", (name) => {
  it("each write is read with its revision, newer than the last", async () => {
    freshStorage(name);
    const adapter = openStorage(name);

    await adapter.set("cart", { items: 1 });
    const first = await adapter._read("cart");
    await adapter.set("cart", { items: 2 });
    const second = await adapter._read("cart");

    expect(first.value).toEqual({ items: 1 });
    expect(first.revision).toEqual({ at: expect.any(Number), by: adapter.adapterId });
    expect(second.value).toEqual({ items: 2 });
    expect(second.revision).toEqual(adapter._writtenRevision("cart"));
    expect(isNewerRevision(second.revision, first.revision)).toBe(true);
  });

  it("a write is newer than the revision stored by another tab, even one ahead of this tab's clock", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    const ahead = Date.now() + 60_000;
    await openStorage(name).set("cart", { items: 1 });
    const fullKey = adapter._fullKey("cart");
    if (adapter instanceof IndexedDBAdapter) {
      await adapter._withStore("readwrite", (store) =>
        adapter._answerOf(store.put(JSON.stringify({ [fullKey]: { at: ahead, by: "x" } }), adapter.revisionKey)),
      );
    } else {
      adapter._storage.setItem(adapter.revisionKey, JSON.stringify({ [fullKey]: { at: ahead, by: "x" } }));
    }

    await adapter.set("cart", { items: 2 });

    expect(adapter._writtenRevision("cart")).toEqual({ at: ahead + 1, by: adapter.adapterId });
  });

  it("tells the revision to the other tabs with the write", async () => {
    freshStorage(name);
    const channelName = uniqueChannel();
    const adapter = openStorage(name, { channelName, enableSyncTabs: true });
    const listener = new CrossTabChannel(channelName);
    const heard = [];
    listener.subscribe((change) => heard.push(change));

    await adapter.set("cart", { items: 1 });
    await settle();
    listener.close();

    expect(heard).toHaveLength(1);
    expect(heard[0].revision).toEqual(adapter._writtenRevision("cart"));
  });

  it("is removed with the key: delete, expiration, reset, clear", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    const recordOf = async () => JSON.parse((await rawRecord(adapter)) ?? "{}");

    await adapter.set("a", 1);
    await adapter.set("b", 2, 1);
    await adapter.set("c", 3);
    await adapter.delete("a");
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await adapter.get("b")).toBeNull();

    expect(Object.keys(await recordOf())).toEqual([adapter._fullKey("c")]);

    await adapter.reset();
    expect(await rawRecord(adapter)).toBeNull();

    await adapter.set("d", 4);
    await adapter.clear();
    expect(await rawRecord(adapter)).toBeNull();
  });

  it("is never listed as a key of the app — encrypted or not", async () => {
    for (const encrypt of [false, true]) {
      freshStorage(name);
      const adapter = openStorage(name, { encrypt });
      await adapter.set("cart", { items: 1 });

      expect(await adapter.list()).toEqual([{ key: "cart", value: { items: 1 } }]);
      expect(await adapter.getAll()).toEqual([{ key: "cart", value: { items: 1 } }]);
    }
  });

  it("shows no key name when encrypting", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true });
    await adapter.set("shopping-cart", { items: 1 });

    const record = await rawRecord(adapter);

    expect(record).not.toContain("shopping-cart");
    expect(Object.keys(JSON.parse(record))).toEqual([adapter._fullKey("shopping-cart")]);
  });

  it("a value stored by 1.3.x (no revision) is read, without revision", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await writeRaw(adapter, "cart", JSON.stringify({ items: 1 }));

    expect(await adapter._read("cart")).toEqual({ value: { items: 1 }, revision: undefined });
    expect(await adapter.get("cart")).toEqual({ items: 1 });
  });

  it("an entry that is not a revision is no revision — the next write is ordered all the same", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 });
    const fullKey = adapter._fullKey("cart");
    const broken = JSON.stringify({ [fullKey]: { at: "soon" } });
    if (adapter instanceof IndexedDBAdapter) {
      await adapter._withStore("readwrite", (store) => adapter._answerOf(store.put(broken, adapter.revisionKey)));
    } else {
      adapter._storage.setItem(adapter.revisionKey, broken);
    }

    expect((await adapter._read("cart")).revision).toBeUndefined();
    const before = adapter._writtenRevision("cart");
    await adapter.set("cart", { items: 2 });
    expect(isNewerRevision(adapter._writtenRevision("cart"), before)).toBe(true);
  });

  it("rise after the key is removed, even when the clock goes back", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 });
    const first = adapter._writtenRevision("cart");
    await adapter.delete("cart");
    vi.spyOn(Date, "now").mockReturnValue(first.at - 60_000);

    await adapter.set("cart", { items: 2 });

    expect(adapter._writtenRevision("cart")).toEqual({ at: first.at + 1, by: adapter.adapterId });
  });

  it("a removed key leaves no revision to read", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 });
    await adapter.delete("cart");

    expect(await adapter._read("cart")).toEqual({ value: null });
  });
});

// ------------------------------------------------------------------------------------------------

describe.each(["LocalStorageAdapter", "SessionStorageAdapter"])("%s — a value written again as this tab sees it", (name) => {
  // setItem with the value already there changes nothing: another tab's write saved over it, unseen by this tab yet,
  // would stay — under this write's revision
  it("is removed first, so the write reaches storage", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 });
    const fullKey = adapter._fullKey("cart");
    const order = [];
    for (const method of ["removeItem", "setItem"]) {
      const original = adapter._storage[method].bind(adapter._storage);
      vi.spyOn(adapter._storage, method).mockImplementation((key, ...rest) => {
        if (key === fullKey) order.push(method);
        return original(key, ...rest);
      });
    }

    await adapter.set("cart", { items: 1 });

    expect(order).toEqual(["removeItem", "setItem"]);
    expect(await adapter._read("cart")).toEqual({ value: { items: 1 }, revision: adapter._writtenRevision("cart") });
  });

  it("a different value is written without removing", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 });
    const removes = vi.spyOn(adapter._storage, "removeItem");

    await adapter.set("cart", { items: 2 });

    expect(removes).not.toHaveBeenCalledWith(adapter._fullKey("cart"));
    expect(await adapter.get("cart")).toEqual({ items: 2 });
  });
});

// ------------------------------------------------------------------------------------------------

describe.each(["LocalStorageAdapter", "SessionStorageAdapter"])("%s — a broken revisions record", (name) => {
  it("reads as none: values are read and written all the same", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await adapter.set("cart", { items: 1 });
    adapter._storage.setItem(adapter.revisionKey, "{ broken");

    expect(await adapter._read("cart")).toEqual({ value: { items: 1 }, revision: undefined });
    expect(await adapter.set("cart", { items: 2 })).toBe(true);
    expect(await adapter._read("cart")).toEqual({ value: { items: 2 }, revision: adapter._writtenRevision("cart") });
  });
});

describe("IndexedDBAdapter — a write whose transaction aborts", () => {
  it("keeps no revision", async () => {
    freshStorage("IndexedDBAdapter");
    const adapter = openStorage("IndexedDBAdapter");
    await adapter.set("cart", { items: 1 });
    const saved = adapter._writtenRevision("cart");
    vi.spyOn(adapter, "_changeExpires").mockRejectedValueOnce(new Error("request failed"));

    expect(await adapter.set("cart", { items: 2 })).toBe(false);

    expect(adapter._writtenRevision("cart")).toBe(saved);
    expect(await adapter._read("cart")).toEqual({ value: { items: 1 }, revision: saved });
  });
});
