import { describe, it, expect, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import { writable, get } from "svelte/store";
import { create } from "zustand";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, uniqueChannel, settle, writeRaw } from "../__fixtures__/storages.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";
import SvelteAdapter from "../../src/stores/SvelteAdapter.js";
import ReactAdapter from "../../src/stores/ReactAdapter.js";

// ------------------------------------------------------------------------------------------------
// onError on reads (1.3.0): a value that is there but cannot be read (another password, changed by hand, not JSON)
// still reads as null — and the app is told, so it can tell "nothing stored" from "stored but unreadable".
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

const messagesOf = (errors) => errors.map((error) => error.message);

describe.each(STORAGE_NAMES)("%s — reads that fail", (name) => {
  it("tells onError when the value does not decrypt (another password)", async () => {
    freshStorage(name);
    await openStorage(name, { encrypt: true, password: "one" }).set("cart", { items: 1 });
    const errors = [];

    const value = await openStorage(name, { encrypt: true, password: "two" }).get("cart", { onError: (error) => errors.push(error) });

    expect(value).toBeNull();
    expect(messagesOf(errors)).toEqual(['Storagefy: could not read "cart"']);
    expect(errors[0].cause).toBeInstanceOf(Error);
  });

  it("tells onError when a plain value is not JSON", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await writeRaw(adapter, "cart", "{ not json");
    const errors = [];

    expect(await adapter.get("cart", { onError: (error) => errors.push(error) })).toBeNull();
    expect(messagesOf(errors)).toEqual(['Storagefy: could not read "cart"']);
  });

  it("tells nothing when the key is simply absent", async () => {
    freshStorage(name);
    const onError = vi.fn();
    expect(await openStorage(name).get("cart", { onError })).toBeNull();
    expect(onError).not.toHaveBeenCalled();
  });

  it("an onError that throws is not passed on — the read still answers", async () => {
    freshStorage(name);
    const adapter = openStorage(name);
    await writeRaw(adapter, "cart", "{ not json");
    const onError = () => {
      throw new Error("app bug");
    };
    expect(await adapter.get("cart", { onError })).toBeNull();
  });

  it.each([
    ["Pinia", () => defineStore("cart", { state: () => ({ items: 0 }) })(createPinia()), (store) => store.items, (s) => new PiniaAdapter(s)],
    ["Svelte", () => writable({ items: 0 }), (store) => get(store).items, (s) => new SvelteAdapter(s)],
    ["React (Zustand)", () => create(() => ({ items: 0 })), (store) => store.getState().items, (s) => new ReactAdapter(s)],
  ])("getFromStorage tells onError and keeps the %s store as it is", async (_lib, makeStore, itemsOf, adapterFor) => {
    freshStorage(name);
    await openStorage(name, { encrypt: true, password: "one" }).set("cart", { items: 1 });
    const store = makeStore();
    const errors = [];

    const loaded = await adapterFor(openStorage(name, { encrypt: true, password: "two" })).getFromStorage(store, "cart", {
      onError: (error) => errors.push(error),
    });

    expect(loaded).toBeUndefined();
    expect(itemsOf(store)).toBe(0);
    expect(messagesOf(errors)).toEqual(['Storagefy: could not read "cart"']);
  });

  it("a change from another tab that cannot be read is told to the store's onError", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const here = defineStore("cart", { state: () => ({ items: 0 }) })(createPinia());
    const errors = [];
    const hereStorage = openStorage(name, { encrypt: true, password: "one", channelName: channel, enableSyncTabs: true });
    await new PiniaAdapter(hereStorage).setInStorage(here, "cart", { syncTabs: true, onError: (error) => errors.push(error) });

    const thereStorage = openStorage(name, { encrypt: true, password: "two", channelName: channel, enableSyncTabs: true });
    await thereStorage.set("cart", { items: 4 });
    await settle();

    expect(here.items).toBe(0);
    expect(messagesOf(errors)).toEqual(['Storagefy: could not read "cart"']);
  });
});

describe("IndexedDBAdapter — a database that cannot open", () => {
  it("reads null and tells onError, writes false — no unhandled rejection", async () => {
    freshStorage("IndexedDBAdapter");
    vi.spyOn(indexedDB, "open").mockImplementation(() => {
      const request = {};
      setTimeout(() => {
        request.error = new Error("blocked by the browser");
        request.onerror?.();
      }, 0);
      return request;
    });
    const adapter = openStorage("IndexedDBAdapter");
    const errors = [];

    expect(await adapter.get("cart", { onError: (error) => errors.push(error) })).toBeNull();
    expect(await adapter.set("cart", { items: 1 })).toBe(false);
    expect(errors[0].cause.message).toBe("blocked by the browser");
  });
});
