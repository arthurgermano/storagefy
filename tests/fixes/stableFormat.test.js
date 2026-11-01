import { describe, it, expect, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import * as cryptoHelper from "../../src/helpers/cryptoHelper.js";
import StorageAdapter from "../../src/adapters/StorageAdapter.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";
import { freshStorage, openStorage, closeAll, uniqueChannel, settle } from "../__fixtures__/storages.js";

// ------------------------------------------------------------------------------------------------
// What must never change by accident:
//   - the keys derived from a password: a value stored by one version must open in the next. The expected keys were
//     computed apart, with the Web Crypto API alone (not with this library)
//   - the order of the writes of a key, even if a write ever throws
//   - a change of another key in another tab is not read by this store
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

const hexOf = async (key) => Buffer.from(await crypto.subtle.exportKey("raw", key)).toString("hex");

describe("deriveKey — known answers", () => {
  it("HKDF: password, salt (the storage key) and the info of Storagefy", async () => {
    const key = await cryptoHelper.deriveKey("app-secret", "session", true, "hkdf");
    expect(await hexOf(key)).toBe("23eff4131124df3f4813def82fd4bc819510f4e1a7d866194a9fd5cd4084ad29");
  });

  it("PBKDF2: 100,000 rounds of SHA-256 — the derivation of every value written up to 1.2.x", async () => {
    const key = await cryptoHelper.deriveKey("app-secret", "session", true, "pbkdf2");
    expect(await hexOf(key)).toBe("8ca9d58d1515d4d75bbf3a55ca2da86a0a64b973a6d08e057954bf3fe43d94dc");
  });
});

describe("StorageAdapter — the queue of a key", () => {
  it("a write that throws does not stop the writes after it", async () => {
    const adapter = new StorageAdapter();
    const ran = [];
    const failing = adapter._inOrder("k", async () => {
      throw new Error("write bug");
    });
    const next = adapter._inOrder("k", async () => ran.push("next"));

    await expect(failing).rejects.toThrow("write bug");
    await next;
    expect(ran).toEqual(["next"]);
    expect(adapter._pendingWrites.size).toBe(0);
  });
});

describe("a change of another key", () => {
  it("is not read by a store kept under another key", async () => {
    freshStorage("LocalStorageAdapter");
    const channel = uniqueChannel();
    const here = openStorage("LocalStorageAdapter", { channelName: channel, enableSyncTabs: true });
    const store = defineStore("cart", { state: () => ({ items: 0 }) })(createPinia());
    await new PiniaAdapter(here).setInStorage(store, "cart", { syncTabs: true });
    const reads = vi.spyOn(here, "get");

    await openStorage("LocalStorageAdapter", { channelName: channel, enableSyncTabs: true }).set("theme", "dark");
    await settle();

    expect(reads).not.toHaveBeenCalled();
  });
});
