import { describe, it, expect, afterEach } from "vitest";
import { Window } from "happy-dom";
import { sleep } from "misc-helpers";
import { createPinia, defineStore } from "pinia";
import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";

// ------------------------------------------------------------------------------------------------
// Pinia stores kept in step across tabs (syncTabs). Two "tabs" in one process: each its own Pinia, store and storage
// adapter, joined by the same BroadcastChannel name — as two tabs of one app are.
// ------------------------------------------------------------------------------------------------

/** Lets the write, the broadcast and the other tab's update run */
const settle = () => sleep(60);

const useCounterStore = defineStore("counter", { state: () => ({ count: 0, label: "start" }) });

const opened = [];

afterEach(() => {
  for (const adapter of opened.splice(0)) {
    adapter.channel?.close();
    adapter.destroy();
  }
});

const storages = {
  LocalStorageAdapter: {
    // Both tabs see the same localStorage, as in a browser
    shared: () => {
      const storage = new Window().localStorage;
      return () => (global.localStorage = storage);
    },
    create: (options) => new LocalStorageAdapter(options),
  },
  SessionStorageAdapter: {
    shared: () => {
      const storage = new Window().sessionStorage;
      return () => (global.sessionStorage = storage);
    },
    create: (options) => new SessionStorageAdapter(options),
  },
};

describe.each(Object.keys(storages))("%s — Pinia across tabs", (name) => {
  /** Opens one tab: its storage adapter, Pinia store and subscription; counts the times its state is replaced */
  async function openTab(useStorage, channelName, crypto) {
    useStorage();
    const storage = storages[name].create({
      dbName: "syncDB",
      expireCheckInterval: 0,
      channelName,
      enableSyncTabs: true,
      ...crypto,
    });
    opened.push(storage);
    const store = useCounterStore(createPinia());
    const updates = { count: 0 };
    await new PiniaAdapter(storage).setInStorage(store, "counter", { syncTabs: true });
    store.$subscribe(() => {
      updates.count += 1;
    });
    return { store, updates };
  }

  async function twoTabs(crypto = { encrypt: false }) {
    const useStorage = storages[name].shared();
    const channelName = `sync_${Math.random().toString(36).slice(2)}`;
    const first = await openTab(useStorage, channelName, crypto);
    const second = await openTab(useStorage, channelName, crypto);
    await settle();
    first.updates.count = 0;
    second.updates.count = 0;
    return { first, second };
  }

  it.each([
    ["in plain text", { encrypt: false }],
    ["encrypted", { encrypt: true }],
    ["encrypted with the app's password", { encrypt: true, password: "app-secret" }],
  ])("brings a change made in one tab to the other — %s", async (_case, crypto) => {
    const { first, second } = await twoTabs(crypto);

    first.store.$patch({ count: 5, label: "changed" });
    await settle();

    expect(second.store.$state).toEqual({ count: 5, label: "changed" });
  });

  it("does not write back what it received — no echo between the tabs", async () => {
    const { first, second } = await twoTabs();

    first.store.$patch({ count: 7 });
    await settle();

    // The first tab changed once (its own patch) and was not updated again by an echo from the second
    expect(first.updates.count).toBe(1);
    expect(second.store.$state.count).toBe(7);
  });

  it("leaves the other tab alone when it already holds the same state", async () => {
    const { first, second } = await twoTabs();
    first.store.$patch({ count: 5 });
    await settle();
    second.updates.count = 0;

    // Written again with the very same state: the second tab has nothing to change
    first.store.$patch({ count: 5 });
    await settle();

    expect(second.store.$state).toEqual({ count: 5, label: "start" });
    expect(second.updates.count).toBe(0);
  });
});
