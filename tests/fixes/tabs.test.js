import { describe, it, expect, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import { writable, get } from "svelte/store";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, uniqueChannel, settle } from "../__fixtures__/storages.js";
import CrossTabChannel from "../../src/helpers/CrossTabChannel.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";
import SvelteAdapter from "../../src/stores/SvelteAdapter.js";

// ------------------------------------------------------------------------------------------------
// The tabs of an app, kept in step:
//   - a channel has as many listeners as want it: up to 1.2.x each new one replaced the last, so a second store
//     adapter on a storage silently stopped the first one's sync
//   - Svelte stores sync: up to 1.2.x setInStorage with syncTabs always failed (ReferenceError: store is not defined)
//   - a change whose state the store already holds (ignoreKeys left out) is not applied again
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

function syncedTab(name, channelName) {
  return openStorage(name, { channelName, enableSyncTabs: true });
}

describe("CrossTabChannel — listeners", () => {
  it("gives every listener every message, until each stops", async () => {
    const name = uniqueChannel();
    const here = new CrossTabChannel(name);
    const there = new CrossTabChannel(name);
    const first = [];
    const second = [];
    const stopFirst = here.subscribe((data) => first.push(data));
    here.subscribe((data) => second.push(data));

    there.emit("one");
    await settle();
    stopFirst();
    there.emit("two");
    await settle();

    expect(first).toEqual(["one"]);
    expect(second).toEqual(["one", "two"]);
    here.close();
    there.close();
  });
});

describe.each(STORAGE_NAMES)("%s — stores across tabs", (name) => {
  it("keeps in step two store adapters that share one storage adapter", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const useCart = defineStore("cart", { state: () => ({ items: 0 }) });
    const useTheme = defineStore("theme", { state: () => ({ mode: "light" }) });

    const hereStorage = syncedTab(name, channel);
    const hereCart = useCart(createPinia());
    const hereTheme = useTheme(createPinia());
    await new PiniaAdapter(hereStorage).setInStorage(hereCart, "cart", { syncTabs: true });
    await new PiniaAdapter(hereStorage).setInStorage(hereTheme, "theme", { syncTabs: true });

    const thereStorage = syncedTab(name, channel);
    const thereCart = useCart(createPinia());
    const thereTheme = useTheme(createPinia());
    await new PiniaAdapter(thereStorage).setInStorage(thereCart, "cart");
    await new PiniaAdapter(thereStorage).setInStorage(thereTheme, "theme");
    await settle();

    thereCart.items = 3;
    thereTheme.mode = "dark";
    await settle();

    expect(hereCart.items).toBe(3);
    expect(hereTheme.mode).toBe("dark");
  });

  it("keeps Svelte stores in step — without writing the change back or keeping the marker", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const hereStorage = syncedTab(name, channel);
    const here = writable({ items: 0 });
    await new SvelteAdapter(hereStorage).setInStorage(here, "cart", { syncTabs: true });

    const thereStorage = syncedTab(name, channel);
    const there = writable({ items: 0 });
    await new SvelteAdapter(thereStorage).setInStorage(there, "cart", { syncTabs: true });
    await settle();
    const writesHere = vi.spyOn(hereStorage, "set");

    there.set({ items: 5 });
    await settle();

    expect(get(here)).toEqual({ items: 5 });
    expect(writesHere).not.toHaveBeenCalled();
    expect(await hereStorage.get("cart")).toEqual({ items: 5 });
  });

  it("does not apply a change whose state the store already holds, ignoreKeys left out", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const useForm = defineStore("form", { state: () => ({ title: "a", draft: "" }) });

    const hereStorage = syncedTab(name, channel);
    const here = useForm(createPinia());
    await new PiniaAdapter(hereStorage).setInStorage(here, "form", { syncTabs: true, ignoreKeys: ["draft"] });
    here.draft = "typing here";
    await settle();

    const thereStorage = syncedTab(name, channel);
    const there = useForm(createPinia());
    await new PiniaAdapter(thereStorage).setInStorage(there, "form", { ignoreKeys: ["draft"] });
    await settle();
    const changesHere = vi.fn();
    here.$subscribe(changesHere);

    there.draft = "typing there";
    await settle();

    expect(changesHere).not.toHaveBeenCalled();
    expect(here.draft).toBe("typing here");
  });

  it("a key removed in another tab leaves this store's state as it is", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const useCart = defineStore("cart", { state: () => ({ items: 0 }) });

    const hereStorage = syncedTab(name, channel);
    const here = useCart(createPinia());
    await new PiniaAdapter(hereStorage).setInStorage(here, "cart", { syncTabs: true });
    here.items = 2;
    await settle();

    const thereStorage = syncedTab(name, channel);
    await thereStorage.delete("cart");
    await settle();

    expect(here.items).toBe(2);
  });

  it("stops applying the other tabs' changes once the store is no longer kept (destroy)", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const useCart = defineStore("cart", { state: () => ({ items: 0 }) });
    const hereStorage = syncedTab(name, channel);
    const here = useCart(createPinia());
    const hereAdapter = new PiniaAdapter(hereStorage);
    await hereAdapter.setInStorage(here, "cart", { syncTabs: true });

    hereAdapter.destroy("cart");
    const thereStorage = syncedTab(name, channel);
    await thereStorage.set("cart", { items: 9 });
    await settle();

    expect(here.items).toBe(0);
  });
});

describe.each(STORAGE_NAMES)("%s — nothing tied to the page's unload", (name) => {
  it("registers no beforeunload listener (it can keep the page out of the back/forward cache)", () => {
    const listen = vi.spyOn(window, "addEventListener");
    freshStorage(name);
    openStorage(name);
    expect(listen.mock.calls.map(([type]) => type)).not.toContain("beforeunload");
  });
});

describe.each(STORAGE_NAMES)("%s — a missing storage opens nothing", (name) => {
  it("throws before opening a channel", () => {
    const storageGlobal = { LocalStorageAdapter: "localStorage", SessionStorageAdapter: "sessionStorage", IndexedDBAdapter: "indexedDB" }[name];
    const created = [];
    const RealChannel = globalThis.BroadcastChannel;
    vi.stubGlobal(
      "BroadcastChannel",
      class extends RealChannel {
        constructor(channelName) {
          super(channelName);
          created.push(this);
        }
      },
    );
    vi.stubGlobal(storageGlobal, undefined);
    try {
      expect(() => openStorage(name, { channelName: uniqueChannel() })).toThrow("is not available in this environment");
      expect(created).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
