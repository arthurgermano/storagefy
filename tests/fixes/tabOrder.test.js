import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import { writable, get } from "svelte/store";
import { createStore } from "zustand/vanilla";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll, uniqueChannel, settle } from "../__fixtures__/storages.js";
import CrossTabChannel from "../../src/helpers/CrossTabChannel.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";
import { isNewerRevision } from "../../src/adapters/StorageAdapter.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";
import SvelteAdapter from "../../src/stores/SvelteAdapter.js";
import ReactAdapter from "../../src/stores/ReactAdapter.js";
import StoreAdapter from "../../src/stores/StoreAdapter.js";

// ------------------------------------------------------------------------------------------------
// The order of the tabs' writes (1.4.0). Up to 1.3.x:
//   - a change of an ignored key alone wrote the stored part again and told the other tabs: a tab that had just made a
//     real change received this older state and applied it — the change was lost, in memory and in storage
//   - setInStorage wrote the state as it started, even when storage held it already: a tab opening while another
//     changed the store undid that change the same way
//   - a tab applied any state that differed from its own: with localStorage, two tabs changing the store at once each
//     ended with the other's state; with IndexedDB, a tab could read storage before its own write was saved
//   - a tab back from the background (or from the page cache) never learned the changes it missed
// Each write now has a revision (see Revision): a tab applies only a state newer than the one it holds.
// ------------------------------------------------------------------------------------------------

// The store adapters of a test stop following the tabs after it: they listen to the window, which the storage events
// of the next tests reach
const storeAdapters = new Set();

beforeEach(() => {
  const keep = StoreAdapter.prototype._keep;
  vi.spyOn(StoreAdapter.prototype, "_keep").mockImplementation(function (...args) {
    storeAdapters.add(this);
    return keep.apply(this, args);
  });
});

afterEach(() => {
  for (const adapter of storeAdapters) {
    adapter.destroyAll();
  }
  storeAdapters.clear();
  vi.restoreAllMocks();
  closeAll();
});

/** A storage adapter of a tab that tells the other tabs its writes */
function tab(name, channelName) {
  return openStorage(name, { channelName, enableSyncTabs: true });
}

const useProfile = defineStore("profile", { state: () => ({ name: null, age: null, draft: "" }) });

/** A Pinia store kept in a tab (syncTabs, draft left out of storage) */
async function profileIn(storage, options = {}) {
  const store = useProfile(createPinia());
  const adapter = new PiniaAdapter(storage);
  await adapter.setInStorage(store, "profile", { syncTabs: true, ignoreKeys: ["draft"], ...options });
  return { store, adapter };
}

/** What another tab would send for a write of this state (IndexedDB sends no value: the tab reads storage) */
async function messageOf(storage, state, revision) {
  const value = storage instanceof IndexedDBAdapter ? undefined : await storage._encrypt("profile", JSON.stringify(state));
  return { adapterId: "another-tab", dbName: storage.dbName, key: "profile", value, origin: "set", revision };
}

/** Sends a message on a channel, as another tab */
async function tell(channelName, message) {
  const other = new CrossTabChannel(channelName);
  other.emit(message);
  await settle();
  other.close();
}

/** Writes a state and its revision in storage, as another tab whose message never came */
async function writeStored(storage, state, revision) {
  const fullKey = storage._fullKey("profile");
  const stored = await storage._encrypt("profile", JSON.stringify(state));
  if (storage instanceof IndexedDBAdapter) {
    await storage._withStore("readwrite", (store) =>
      Promise.all([
        storage._answerOf(store.put(stored, fullKey)),
        storage._answerOf(store.put(JSON.stringify({ [fullKey]: revision }), storage.revisionKey)),
      ]),
    );
    return;
  }
  storage._storage.setItem(fullKey, stored);
  storage._storage.setItem(storage.revisionKey, JSON.stringify({ [fullKey]: revision }));
}

/** The tab is shown again */
function showTab() {
  document.dispatchEvent(new Event("visibilitychange"));
}

/** The page is shown — persisted: back from the browser's page cache (happy-dom leaves persisted out: set here) */
function showPage(persisted) {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: persisted });
  document.defaultView.dispatchEvent(event);
}

/** A tab opening: the store loaded, then kept (as setPiniaStorage does) */
async function openingTab(storage) {
  const store = useProfile(createPinia());
  const adapter = new PiniaAdapter(storage);
  await adapter.getFromStorage(store, "profile");
  await adapter.setInStorage(store, "profile", { syncTabs: true, ignoreKeys: ["draft"] });
  return store;
}

// ------------------------------------------------------------------------------------------------

describe.each(STORAGE_NAMES)("%s — a change of an ignored key alone", (name) => {
  it("writes nothing and tells no tab", async () => {
    freshStorage(name);
    const storage = tab(name, uniqueChannel());
    const { store } = await profileIn(storage);
    const writes = vi.spyOn(storage, "set");
    const told = vi.spyOn(storage.channel, "emit");

    store.draft = "typing";
    await settle();

    expect(writes).not.toHaveBeenCalled();
    expect(told).not.toHaveBeenCalled();

    store.name = "Ana";
    await settle();

    expect(writes).toHaveBeenCalledTimes(1);
    expect(await storage.get("profile")).toEqual({ name: "Ana", age: null });
  });

  it("writes nothing after a change of another tab was applied", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const hereStorage = tab(name, channel);
    const { store: here } = await profileIn(hereStorage);
    const { store: there } = await profileIn(tab(name, channel));

    there.name = "Ana";
    await settle();
    expect(here.name).toBe("Ana");
    const writes = vi.spyOn(hereStorage, "set");

    here.draft = "typing";
    await settle();

    expect(writes).not.toHaveBeenCalled();
  });

  it("is written after a write that failed — the state may not be stored", async () => {
    freshStorage(name);
    const storage = tab(name, uniqueChannel());
    const onError = vi.fn();
    const { store } = await profileIn(storage, { onError });
    const writes = vi.spyOn(storage, "set").mockResolvedValueOnce(false);

    store.name = "Ana";
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);

    store.draft = "typing";
    await settle();

    expect(writes).toHaveBeenCalledTimes(2);
    expect(await storage.get("profile")).toEqual({ name: "Ana", age: null });
  });

  it("is written after a write that threw", async () => {
    freshStorage(name);
    const storage = tab(name, uniqueChannel());
    const onError = vi.fn();
    const { store } = await profileIn(storage, { onError });
    const writes = vi.spyOn(storage, "set").mockRejectedValueOnce(new Error("storage gone"));

    store.name = "Ana";
    await settle();
    expect(onError).toHaveBeenCalledTimes(1);

    store.draft = "typing";
    await settle();

    expect(writes).toHaveBeenCalledTimes(2);
    expect(await storage.get("profile")).toEqual({ name: "Ana", age: null });
  });

  it("a state that is not JSON is written each time — and its failure told", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    const onError = vi.fn();
    const counter = writable({ count: 1n });
    await new SvelteAdapter(storage).setInStorage(counter, "counter", { onError });
    const writes = vi.spyOn(storage, "set");

    counter.set({ count: 1n });
    await settle();

    expect(writes).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(2);
  });
});

// ------------------------------------------------------------------------------------------------

describe.each(STORAGE_NAMES)("%s — the first write of setInStorage", (name) => {
  it("is skipped when storage holds the state already", async () => {
    freshStorage(name);
    const storage = tab(name, uniqueChannel());
    await storage.set("profile", { name: "Ana", age: 3 });
    const store = useProfile(createPinia());
    const adapter = new PiniaAdapter(storage);
    await adapter.getFromStorage(store, "profile");
    const writes = vi.spyOn(storage, "set");
    const told = vi.spyOn(storage.channel, "emit");

    await adapter.setInStorage(store, "profile", { syncTabs: true, ignoreKeys: ["draft"] });
    await settle();

    expect(writes).not.toHaveBeenCalled();
    expect(told).not.toHaveBeenCalled();
  });

  it("sets the expiration again, as a write would — without writing", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    await storage.set("profile", { name: "Ana", age: 3 }, 1_000);
    const store = useProfile(createPinia());
    const adapter = new PiniaAdapter(storage);
    await adapter.getFromStorage(store, "profile");
    const writes = vi.spyOn(storage, "set");

    await adapter.setInStorage(store, "profile", { ignoreKeys: ["draft"], timeout: 60_000 });

    expect(writes).not.toHaveBeenCalled();
    expect(await storage.getExpire("profile")).toBeGreaterThan(Date.now() + 30_000);
  });

  it("drops the expiration without timeout, as a write would", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    await storage.set("profile", { name: "Ana", age: 3 }, 60_000);
    const store = useProfile(createPinia());
    const adapter = new PiniaAdapter(storage);
    await adapter.getFromStorage(store, "profile");

    await adapter.setInStorage(store, "profile", { ignoreKeys: ["draft"] });

    expect(await storage.getExpire("profile")).toBeNull();
    expect(await storage.get("profile")).toEqual({ name: "Ana", age: 3 });
  });

  it("with a timeout of 0, removes the key — as a write would", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    await storage.set("profile", { name: "Ana", age: 3 });
    const store = useProfile(createPinia());
    const adapter = new PiniaAdapter(storage);
    await adapter.getFromStorage(store, "profile");

    await adapter.setInStorage(store, "profile", { ignoreKeys: ["draft"], timeout: 0 });

    expect(await storage.get("profile")).toBeNull();
  });

  it("writes nothing and sets no expiration for an empty store with nothing stored", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    const writes = vi.spyOn(storage, "set");
    const expirations = vi.spyOn(storage, "setExpire");

    await new SvelteAdapter(storage).setInStorage(writable(null), "session", { timeout: 60_000 });

    expect(writes).not.toHaveBeenCalled();
    expect(expirations).not.toHaveBeenCalled();
  });

  it("writes over a stored value that cannot be read", async () => {
    freshStorage(name);
    await openStorage(name, { encrypt: true, password: "old secret" }).set("profile", { name: "Old", age: 1 });
    const storage = openStorage(name, { encrypt: true, password: "new secret" });

    const { store } = await profileIn(storage);

    expect(store.name).toBeNull();
    expect(await storage.get("profile")).toEqual({ name: null, age: null });
  });

  it("writes the state when it differs from the stored one", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    await storage.set("profile", { name: "Ana", age: 3 });
    const writes = vi.spyOn(storage, "set");

    await profileIn(storage);

    expect(writes).toHaveBeenCalledTimes(1);
    expect(await storage.get("profile")).toEqual({ name: null, age: null });
  });
});

// ------------------------------------------------------------------------------------------------

describe.each([
  ["Pinia", () => useProfile(createPinia()), (storage) => new PiniaAdapter(storage), (store) => store.$patch({ name: "Ana" })],
  ["Svelte", () => writable({ name: null }), (storage) => new SvelteAdapter(storage), (store) => store.set({ name: "Ana" })],
  ["React", () => createStore(() => ({ name: null })), (storage) => new ReactAdapter(storage), (store) => store.setState({ name: "Ana" })],
])("%s — a store kept again or no longer while storage was read", (label, createStore, createAdapter, change) => {
  it("is not written, and setInStorage answers true", async () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    const adapter = createAdapter(storage);
    const store = createStore();
    const writes = vi.spyOn(storage, "set");

    const kept = adapter.setInStorage(store, "profile");
    adapter.destroy("profile");

    expect(await kept).toBe(true);
    change(store);
    await settle();
    expect(writes).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------------------------------------

describe.each(STORAGE_NAMES)("%s — the order of the tabs' writes", (name) => {
  it("two tabs changing the store at once end with the same state — the one stored", async () => {
    for (let round = 0; round < 5; round++) {
      freshStorage(name);
      const channel = uniqueChannel();
      const hereStorage = tab(name, channel);
      const { store: here } = await profileIn(hereStorage);
      const { store: there } = await profileIn(tab(name, channel));
      await settle();

      here.name = "Ana";
      there.age = 3;
      await settle();
      await settle();

      const stored = await openStorage(name).get("profile");
      expect({ name: here.name, age: here.age }).toEqual({ name: there.name, age: there.age });
      if (name !== "SessionStorageAdapter") {
        // sessionStorage: the change of another tab goes to the store, not to this tab's storage
        expect(stored).toEqual({ name: here.name, age: here.age });
      }
      await closeAll();
    }
  });

  it("a tab opening while another changes the store does not undo the change", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const { store: here } = await profileIn(tab(name, channel));
    await settle();

    const opening = openingTab(tab(name, channel));
    here.name = "Ana";
    const there = await opening;
    await settle();
    await settle();

    expect(here.name).toBe("Ana");
    expect(there.name).toBe("Ana");
  });

  it("an older change heard after a newer write is not applied", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store } = await profileIn(storage);
    store.name = "new";
    await settle();
    const written = storage._writtenRevision("profile");

    await tell(channel, await messageOf(storage, { name: "old", age: null }, { at: written.at - 1, by: "zzz" }));

    expect(store.name).toBe("new");
  });

  it("a change of this tab asked while another's is read lands last, in every tab", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const hereStorage = tab(name, channel);
    const { store: here } = await profileIn(hereStorage);
    const { store: there } = await profileIn(tab(name, channel));
    await settle();
    const reading = name === "IndexedDBAdapter" ? "_read" : "_decrypt";
    const read = hereStorage[reading].bind(hereStorage);
    const reads = vi.spyOn(hereStorage, reading).mockImplementationOnce(async (...args) => {
      here.$patch({ name: "here" });
      return read(...args);
    });

    there.name = "there";
    await settle();
    await settle();

    if (reading === "_decrypt") {
      // IndexedDB reads after the writes asked before; a value sent is read again once the write is over
      expect(reads.mock.calls.length).toBeGreaterThanOrEqual(2);
    }
    expect(here.name).toBe("here");
    expect(there.name).toBe("here");
  });

  it("a write follows the newest revision heard, even one ahead of this tab's clock", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store } = await profileIn(storage);
    const ahead = { at: Date.now() + 60_000, by: "another-tab" };
    // Stored and told, as another tab whose clock is ahead would
    await writeStored(storage, { name: "Ana", age: null }, ahead);
    await tell(channel, await messageOf(storage, { name: "Ana", age: null }, ahead));
    expect(store.name).toBe("Ana");

    store.name = "Bia";
    await settle();

    expect(storage._writtenRevision("profile")).toEqual({ at: ahead.at + 1, by: storage.adapterId });
  });

  it("a write follows the newest revision heard, even before it is read", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store } = await profileIn(storage);
    const ahead = { at: Date.now() + 60_000, by: "another-tab" };
    await tell(channel, await messageOf(storage, { name: "Ana", age: null }, ahead));

    store.age = 4;
    await settle();

    expect(storage._writtenRevision("profile")).toEqual({ at: ahead.at + 1, by: storage.adapterId });
  });

  it("a change older than the state stored as the store started is not applied", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    await openStorage(name).set("profile", { name: "Ana", age: null });
    const stored = await storage._read("profile");
    const store = await openingTab(storage);

    await tell(channel, await messageOf(storage, { name: "old", age: null }, { at: stored.revision.at - 1, by: "zzz" }));

    expect(store.name).toBe("Ana");
  });
});

// ------------------------------------------------------------------------------------------------
// Between tabs, localStorage orders no write of one with another's: of two writes made at the same time, the older
// may reach storage last — every tab holds the newer, storage the older. The tab of the newer, seeing the older reach
// storage (the storage event), writes its state again.
// ------------------------------------------------------------------------------------------------

/** A write of another tab reaching this tab's localStorage, as the browser tells it */
function storageEvent(storage, key) {
  window.dispatchEvent(new StorageEvent("storage", { key, storageArea: storage._storage }));
}

describe.each(["LocalStorageAdapter", "IndexedDBAdapter"])("%s — an older write of another tab found over the store's own", (name) => {
  const olderThan = (written) => ({ at: written.at - 1, by: "another-tab" });

  /** A store that wrote "Ana" — and the revision of that write */
  async function wroteAna(storage) {
    const { store } = await profileIn(storage);
    store.name = "Ana";
    await settle();
    return { store, written: storage._writtenRevision("profile") };
  }

  /** Another tab's write reaching storage: told by the storage event (localStorage) or its message (IndexedDB) */
  async function reaches(storage, channel, state, revision) {
    await writeStored(storage, state, revision);
    if (storage instanceof IndexedDBAdapter) {
      await tell(channel, await messageOf(storage, state, revision));
    } else {
      storageEvent(storage, storage._fullKey("profile"));
    }
    await settle();
  }

  it("is written over with the store's state: storage ends with what the tabs hold", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store, written } = await wroteAna(storage);
    const writes = vi.spyOn(storage, "set");

    await reaches(storage, channel, { name: null, age: 3 }, olderThan(written));

    expect(store.name).toBe("Ana");
    expect(writes).toHaveBeenCalledTimes(1);
    expect(await openStorage(name).get("profile")).toEqual({ name: "Ana", age: null });
    expect((await storage._read("profile")).revision).toEqual(storage._writtenRevision("profile"));
    expect(isNewerRevision(storage._writtenRevision("profile"), written)).toBe(true);
  });

  it("of the state the store holds is not written over: storage holds it already", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { written } = await wroteAna(storage);
    const writes = vi.spyOn(storage, "set");

    await reaches(storage, channel, { name: "Ana", age: null }, olderThan(written));

    expect(writes).not.toHaveBeenCalled();
  });

  it("found when the tab is shown again is written over all the same", async () => {
    freshStorage(name);
    const storage = tab(name, uniqueChannel());
    const { store, written } = await wroteAna(storage);
    await writeStored(storage, { name: null, age: 3 }, olderThan(written));

    showTab();
    await settle();

    expect(store.name).toBe("Ana");
    expect(await openStorage(name).get("profile")).toEqual({ name: "Ana", age: null });
  });

  it("over another tab's state the store holds is left: that tab writes over it", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store, written } = await wroteAna(storage);
    const newer = { at: written.at + 10, by: "another-tab" };
    await writeStored(storage, { name: "Bia", age: null }, newer);
    await tell(channel, await messageOf(storage, { name: "Bia", age: null }, newer));
    expect(store.name).toBe("Bia");
    const writes = vi.spyOn(storage, "set");

    await reaches(storage, channel, { name: "Cid", age: null }, { at: written.at + 5, by: "third-tab" });

    expect(store.name).toBe("Bia");
    expect(writes).not.toHaveBeenCalled();
  });

  it("the store's own write, read back from storage, is not written again", async () => {
    freshStorage(name);
    const storage = tab(name, uniqueChannel());
    await wroteAna(storage);
    const writes = vi.spyOn(storage, "set");

    showTab();
    await settle();

    expect(writes).not.toHaveBeenCalled();
  });

  it("a write over it that fails is told through onError", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const onError = vi.fn();
    const { store } = await profileIn(storage, { onError });
    store.name = "Ana";
    await settle();
    const written = storage._writtenRevision("profile");
    vi.spyOn(storage, "set").mockRejectedValue(new Error("disk gone"));

    await reaches(storage, channel, { name: null, age: 3 }, olderThan(written));

    expect(store.name).toBe("Ana");
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it("the tab of the older write applies the newer, and writes nothing", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store, written } = await wroteAna(storage);
    const writes = vi.spyOn(storage, "set");
    const newer = { at: written.at + 1, by: "another-tab" };
    await writeStored(storage, { name: null, age: 3 }, newer);

    await tell(channel, await messageOf(storage, { name: null, age: 3 }, newer));

    expect(store.$state).toMatchObject({ name: null, age: 3 });
    expect(writes).not.toHaveBeenCalled();
  });
});

describe("LocalStorageAdapter — the message of an older write of another tab", () => {
  /** A store that wrote "Ana" after a write of another tab it knew — and both revisions */
  async function wroteAnaAfter(known) {
    freshStorage("LocalStorageAdapter");
    const channel = uniqueChannel();
    const storage = tab("LocalStorageAdapter", channel);
    const { store } = await profileIn(storage);
    if (known) {
      await writeStored(storage, known.state, known.revision);
      await tell(channel, await messageOf(storage, known.state, known.revision));
    }
    store.name = "Ana";
    await settle();
    return { storage, channel, store, written: storage._writtenRevision("profile") };
  }

  it("unknown as the store wrote: its state is written again — that write may reach storage after the store's", async () => {
    const { storage, channel, store, written } = await wroteAnaAfter();
    const writes = vi.spyOn(storage, "set");

    // Not stored yet: its value is on its way — at the same ms as the store's write before, newer only by its adapter
    await tell(channel, await messageOf(storage, { name: null, age: 3 }, { at: written.at - 1, by: "zzz-tab" }));

    expect(writes).toHaveBeenCalledTimes(1);
    expect(store.name).toBe("Ana");
    expect(isNewerRevision(storage._writtenRevision("profile"), written)).toBe(true);
  });

  it("known as the store wrote: not written again — it was saved before", async () => {
    const known = { state: { name: null, age: 3 }, revision: { at: Date.now() + 1000, by: "another-tab" } };
    const { storage, channel, store } = await wroteAnaAfter(known);
    const writes = vi.spyOn(storage, "set");

    // Heard again, late
    await tell(channel, await messageOf(storage, known.state, known.revision));

    expect(writes).not.toHaveBeenCalled();
    expect(store.$state).toMatchObject({ name: "Ana", age: 3 });
  });

  it("of the state the store holds: not written again", async () => {
    const { storage, channel, written } = await wroteAnaAfter();
    const writes = vi.spyOn(storage, "set");

    await tell(channel, await messageOf(storage, { name: "Ana", age: null }, { at: written.at - 1, by: "zzz-tab" }));

    expect(writes).not.toHaveBeenCalled();
  });
});

describe("LocalStorageAdapter — the storage event", () => {
  /** A store that wrote "Ana", and how often its storage is read */
  async function keptAna() {
    freshStorage("LocalStorageAdapter");
    const channel = uniqueChannel();
    const storage = tab("LocalStorageAdapter", channel);
    const { store, adapter } = await profileIn(storage);
    store.name = "Ana";
    await settle();
    return { storage, channel, store, adapter, reads: vi.spyOn(storage, "_read") };
  }

  it("is followed for the key, the revisions record and a clear — not for another key or storage", async () => {
    const { storage, reads } = await keptAna();

    storageEvent(storage, storage._fullKey("other"));
    window.dispatchEvent(new StorageEvent("storage", { key: storage._fullKey("profile"), storageArea: sessionStorage }));
    await settle();
    expect(reads).not.toHaveBeenCalled();

    for (const key of [storage._fullKey("profile"), storage.revisionKey, null]) {
      storageEvent(storage, key);
      await settle();
    }
    expect(reads).toHaveBeenCalledTimes(3);
  });

  it("is not followed by a store holding another tab's state, nor once the store is no longer kept", async () => {
    const { storage, channel, store, adapter, reads } = await keptAna();
    const newer = { at: storage._writtenRevision("profile").at + 1, by: "another-tab" };
    await tell(channel, await messageOf(storage, { name: "Bia", age: null }, newer));
    expect(store.name).toBe("Bia");
    reads.mockClear();

    storageEvent(storage, storage._fullKey("profile"));
    await settle();
    expect(reads).not.toHaveBeenCalled();

    store.name = "Cid";
    await settle();
    adapter.destroy("profile");
    storageEvent(storage, storage._fullKey("profile"));
    await settle();
    expect(reads).not.toHaveBeenCalled();
  });

  it("outside a browser (no window), nothing is followed", () => {
    freshStorage("LocalStorageAdapter");
    const storage = openStorage("LocalStorageAdapter");
    vi.stubGlobal("window", undefined);
    try {
      const stop = storage._onStoredChange("profile", () => {});
      expect(() => stop()).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("SessionStorageAdapter — a write of another tab made at the same time", () => {
  it("is not written again: each tab has a storage of its own", async () => {
    freshStorage("SessionStorageAdapter");
    const channel = uniqueChannel();
    const storage = tab("SessionStorageAdapter", channel);
    const { store } = await profileIn(storage);
    store.name = "Ana";
    await settle();
    const written = storage._writtenRevision("profile");
    const writes = vi.spyOn(storage, "set");

    await tell(channel, await messageOf(storage, { name: null, age: 3 }, { at: written.at - 1, by: "zzz-tab" }));

    expect(store.name).toBe("Ana");
    expect(writes).not.toHaveBeenCalled();
  });
});

describe("LocalStorageAdapter — three tabs changing the store at once", () => {
  it("end with the same state, the one stored — only the tab of the newest writes again", async () => {
    for (let round = 0; round < 5; round++) {
      freshStorage("LocalStorageAdapter");
      const channel = uniqueChannel();
      const storages = [tab("LocalStorageAdapter", channel), tab("LocalStorageAdapter", channel), tab("LocalStorageAdapter", channel)];
      const stores = [];
      for (const storage of storages) {
        stores.push((await profileIn(storage)).store);
      }
      await settle();
      const writes = storages.map((storage) => vi.spyOn(storage, "set"));

      stores[0].name = "Ana";
      stores[1].age = 3;
      stores[2].name = "Cid";
      await settle();
      await settle();

      const states = stores.map((store) => ({ name: store.name, age: store.age }));
      expect(states[1]).toEqual(states[0]);
      expect(states[2]).toEqual(states[0]);
      expect(await openStorage("LocalStorageAdapter").get("profile")).toEqual(states[0]);
      // The tabs of the older writes applied the newest, and wrote nothing more
      const newest = storages.reduce((a, b) => (isNewerRevision(b._writtenRevision("profile"), a._writtenRevision("profile")) ? b : a));
      storages.forEach((storage, i) => {
        if (storage !== newest) expect(writes[i]).toHaveBeenCalledTimes(1);
      });
      await closeAll();
      writes.forEach((spy) => spy.mockRestore());
    }
  });
});

// ------------------------------------------------------------------------------------------------

describe.each(["LocalStorageAdapter", "SessionStorageAdapter"])("%s — the changes sent with their value", (name) => {
  it("a newer change of the state held is not applied, and an older one after it neither", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store } = await profileIn(storage);
    store.name = "Ana";
    await settle();
    const written = storage._writtenRevision("profile");
    const changes = vi.fn();
    store.$subscribe(changes, { flush: "sync" });

    await tell(channel, await messageOf(storage, { name: "Ana", age: null }, { at: written.at + 10, by: "x" }));
    await tell(channel, await messageOf(storage, { name: "Bia", age: null }, { at: written.at + 5, by: "x" }));

    expect(store.name).toBe("Ana");
    expect(changes).not.toHaveBeenCalled();
  });

  it("an applied change takes its revision: an older one after it is not applied", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store } = await profileIn(storage);
    const written = storage._writtenRevision("profile");

    await tell(channel, await messageOf(storage, { name: "Bia", age: null }, { at: written.at + 10, by: "x" }));
    await tell(channel, await messageOf(storage, { name: "Cid", age: null }, { at: written.at + 5, by: "x" }));

    expect(store.name).toBe("Bia");
  });

  it("after a write that failed, a change with the state held makes it stored: an ignored key alone writes nothing", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store } = await profileIn(storage);
    const writes = vi.spyOn(storage, "set").mockResolvedValueOnce(false);
    store.name = "Ana";
    await settle();

    await tell(channel, await messageOf(storage, { name: "Ana", age: null }, { at: Date.now() + 10, by: "x" }));
    store.draft = "typing";
    await settle();

    expect(writes).toHaveBeenCalledTimes(1);
  });

  it("a change of 1.3.x (no revision) is applied when it differs", async () => {
    freshStorage(name);
    const channel = uniqueChannel();
    const storage = tab(name, channel);
    const { store } = await profileIn(storage);
    store.name = "Ana";
    await settle();

    await tell(channel, await messageOf(storage, { name: "Ana", age: null }));
    await tell(channel, await messageOf(storage, { name: "Bia", age: 2 }));

    expect(store.name).toBe("Bia");
    expect(store.age).toBe(2);
  });
});

// ------------------------------------------------------------------------------------------------

describe.each(["LocalStorageAdapter", "IndexedDBAdapter"])("%s — a tab shown again", (name) => {
  /** Here follows the other tabs; there writes without telling them (as when here missed the messages) */
  async function twoTabs() {
    freshStorage(name);
    const hereStorage = tab(name, uniqueChannel());
    const { store: here, adapter } = await profileIn(hereStorage);
    const { store: there } = await profileIn(openStorage(name));
    return { here, adapter, hereStorage, there };
  }

  it("applies what storage holds when it is newer", async () => {
    const { here, there } = await twoTabs();
    there.name = "Ana";
    await settle();
    expect(here.name).toBeNull();

    showTab();
    await settle();

    expect(here.name).toBe("Ana");
  });

  it("applies it when back from the page cache", async () => {
    const { here, there } = await twoTabs();
    there.name = "Ana";
    await settle();

    showPage(true);
    await settle();

    expect(here.name).toBe("Ana");
  });

  it("reads nothing on a first page show, or when the tab is hidden", async () => {
    const { hereStorage } = await twoTabs();
    const reads = vi.spyOn(hereStorage, "_read");

    showPage(false);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    try {
      showTab();
      await settle();
    } finally {
      delete document.visibilityState;
    }

    expect(reads).not.toHaveBeenCalled();
    expect(document.visibilityState).toBe("visible");
  });

  it("keeps its state when storage holds an older one", async () => {
    const { here, hereStorage } = await twoTabs();
    here.name = "new";
    await settle();
    const written = hereStorage._writtenRevision("profile");
    await writeStored(hereStorage, { name: "old", age: null }, { at: written.at - 1, by: "zzz" });

    showTab();
    await settle();

    expect(here.name).toBe("new");
  });

  it("reads nothing once the store is no longer kept", async () => {
    const { adapter, hereStorage } = await twoTabs();
    adapter.destroy("profile");
    const reads = vi.spyOn(hereStorage, "_read");

    showTab();
    showPage(true);
    await settle();

    expect(reads).not.toHaveBeenCalled();
  });
});

describe("a tab shown again — no storage to read", () => {
  it("with sessionStorage (each tab has its own), reads nothing", async () => {
    freshStorage("SessionStorageAdapter");
    const storage = tab("SessionStorageAdapter", uniqueChannel());
    await profileIn(storage);
    const reads = vi.spyOn(storage, "_read");

    showTab();
    await settle();

    expect(reads).not.toHaveBeenCalled();
  });

  it("outside a browser (no document), follows the other tabs all the same", async () => {
    freshStorage("LocalStorageAdapter");
    const channel = uniqueChannel();
    const realDocument = globalThis.document;
    vi.stubGlobal("document", undefined);
    try {
      const { store: here, adapter } = await profileIn(tab("LocalStorageAdapter", channel));
      const { store: there } = await profileIn(tab("LocalStorageAdapter", channel));

      there.name = "Ana";
      await settle();

      expect(here.name).toBe("Ana");
      adapter.destroy("profile");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(globalThis.document).toBe(realDocument);
  });
});

// ------------------------------------------------------------------------------------------------

describe("Svelte — the state of another tab, kept with its revision", () => {
  it("a store holding the same state takes its revision: an older change after it is not applied", async () => {
    freshStorage("LocalStorageAdapter");
    const channel = uniqueChannel();
    const storage = tab("LocalStorageAdapter", channel);
    const cart = writable({ items: 1 });
    await new SvelteAdapter(storage).setInStorage(cart, "cart", { syncTabs: true });
    const written = storage._writtenRevision("cart");
    const send = async (state, revision) =>
      tell(channel, { adapterId: "x", dbName: "testDB", key: "cart", value: JSON.stringify(state), origin: "set", revision });

    await send({ items: 1 }, { at: written.at + 10, by: "x" });
    await send({ items: 9 }, { at: written.at + 5, by: "x" });

    expect(get(cart)).toEqual({ items: 1 });
  });
});

// ------------------------------------------------------------------------------------------------

describe.each(STORAGE_NAMES)("%s — a store loaded, then changed by another tab before it is kept", (name) => {
  it("Pinia: takes the newer state instead of writing over it", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    await storage.set("profile", { name: "Old", age: 1 });
    const store = useProfile(createPinia());
    const adapter = new PiniaAdapter(storage);
    await adapter.getFromStorage(store, "profile");
    await openStorage(name).set("profile", { name: "Ana", age: 2 });
    const writes = vi.spyOn(storage, "set");

    await adapter.setInStorage(store, "profile", { ignoreKeys: ["draft"] });

    expect(store.name).toBe("Ana");
    expect(writes).not.toHaveBeenCalled();
    expect(await storage.get("profile")).toEqual({ name: "Ana", age: 2 });
  });

  it("Pinia: takes it when nothing was stored as it loaded", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    const store = useProfile(createPinia());
    const adapter = new PiniaAdapter(storage);
    await adapter.getFromStorage(store, "profile");
    await openStorage(name).set("profile", { name: "Ana", age: 2 });

    await adapter.setInStorage(store, "profile", { ignoreKeys: ["draft"] });

    expect(store.name).toBe("Ana");
  });

  it("Pinia: a key removed meanwhile is written again from the store, as before", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    await storage.set("profile", { name: "Old", age: 1 });
    const store = useProfile(createPinia());
    const adapter = new PiniaAdapter(storage);
    await adapter.getFromStorage(store, "profile");
    await openStorage(name).delete("profile");
    const onError = vi.fn();

    await adapter.setInStorage(store, "profile", { ignoreKeys: ["draft"], onError });

    expect(onError).not.toHaveBeenCalled();
    expect(store.name).toBe("Old");
    expect(await storage.get("profile")).toEqual({ name: "Old", age: 1 });
  });

  it("Pinia: a stored value that is not an object is told, and written over", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    await storage.set("profile", { name: "Old", age: 1 });
    const store = useProfile(createPinia());
    const adapter = new PiniaAdapter(storage);
    await adapter.getFromStorage(store, "profile");
    await openStorage(name).set("profile", [1, 2]);
    const onError = vi.fn();

    await adapter.setInStorage(store, "profile", { ignoreKeys: ["draft"], onError });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(await storage.get("profile")).toEqual({ name: "Old", age: 1 });
  });

  it("Svelte: takes the newer state — and when nothing was stored as it loaded", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    const cart = writable({ items: 0 });
    const adapter = new SvelteAdapter(storage);
    await adapter.getFromStorage(cart, "cart");
    await openStorage(name).set("cart", { items: 4 });

    await adapter.setInStorage(cart, "cart");

    expect(get(cart)).toEqual({ items: 4 });

    await openStorage(name).set("cart", { items: 5 });
    await adapter.getFromStorage(cart, "cart");
    await openStorage(name).set("cart", { items: 6 });
    await adapter.setInStorage(cart, "cart");

    expect(get(cart)).toEqual({ items: 6 });
  });

  it("React: takes the newer state — and when nothing was stored as it loaded", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    const store = createStore(() => ({ items: 0 }));
    const adapter = new ReactAdapter(storage);
    await adapter.getFromStorage(store, "cart");
    await openStorage(name).set("cart", { items: 4 });

    await adapter.setInStorage(store, "cart");

    expect(store.getState()).toEqual({ items: 4 });

    await adapter.getFromStorage(store, "cart");
    await openStorage(name).set("cart", { items: 6 });
    await adapter.setInStorage(store, "cart");

    expect(store.getState()).toEqual({ items: 6 });
  });

  it("without getFromStorage, the store's state is written over what is stored, as before", async () => {
    freshStorage(name);
    const storage = openStorage(name);
    await openStorage(name).set("profile", { name: "Ana", age: 2 });

    const { store } = await profileIn(storage);

    expect(store.name).toBeNull();
    expect(await storage.get("profile")).toEqual({ name: null, age: null });
  });
});
