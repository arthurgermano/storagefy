import { describe, it, expect, beforeEach, vi } from "vitest";
import { Window } from "happy-dom";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import * as cryptoHelper from "../../src/helpers/cryptoHelper.js";
import LocalStorageAdapter from "../../src/adapters/LocalStorageAdapter.js";
import SessionStorageAdapter from "../../src/adapters/SessionStorageAdapter.js";
import IndexedDBAdapter from "../../src/adapters/IndexedDBAdapter.js";

// ------------------------------------------------------------------------------------------------
// The AES key of each storage key is derived once per adapter (PBKDF2 is slow on purpose) — and what is stored is
// exactly what it was before the key was kept: a value written by one version opens in the other.
// ------------------------------------------------------------------------------------------------

vi.mock("../../src/helpers/cryptoHelper.js", async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, deriveKey: vi.fn(original.deriveKey) };
});

const { deriveKey: realDeriveKey } = await vi.importActual("../../src/helpers/cryptoHelper.js");

/** Derivations made for one storage key */
function derivationsOf(key) {
  return cryptoHelper.deriveKey.mock.calls.filter(([password]) => password === key).length;
}

/** A value as the previous version stored it: a fresh derivation for every write */
async function encryptLikeBefore(key, value) {
  const cKey = await realDeriveKey(key);
  return JSON.stringify(await cryptoHelper.encryptData(cKey, JSON.stringify(value), false));
}

/** A stored value opened as the previous version did */
async function decryptLikeBefore(key, stored) {
  const cKey = await realDeriveKey(key);
  return JSON.parse(await cryptoHelper.decryptData(cKey, JSON.parse(stored), false));
}

const adapters = {
  LocalStorageAdapter: {
    reset: () => (global.localStorage = new Window().localStorage),
    create: () => new LocalStorageAdapter({ dbName: "keyDB", encrypt: true, expireCheckInterval: 0 }),
    raw: () => global.localStorage,
  },
  SessionStorageAdapter: {
    reset: () => (global.sessionStorage = new Window().sessionStorage),
    create: () => new SessionStorageAdapter({ dbName: "keyDB", encrypt: true, expireCheckInterval: 0 }),
    raw: () => global.sessionStorage,
  },
  IndexedDBAdapter: {
    reset: () => (global.indexedDB = new IDBFactory()),
    create: () => new IndexedDBAdapter({ dbName: "keyDB", encrypt: true, expireCheckInterval: 0 }),
    raw: null,
  },
};

describe.each(Object.keys(adapters))("%s — the derived key is kept", (name) => {
  const setup = adapters[name];

  beforeEach(() => {
    setup.reset();
    cryptoHelper.deriveKey.mockClear();
  });

  it("derives once for many writes and reads of the same key", async () => {
    const adapter = setup.create();
    for (let round = 0; round < 5; round += 1) {
      await adapter.set("session", { validUntil: round });
      expect(await adapter.get("session")).toEqual({ validUntil: round });
    }
    expect(derivationsOf("session")).toBe(1);
  });

  it("derives once per key — each key keeps its own", async () => {
    const adapter = setup.create();
    await adapter.set("session", { validUntil: 1 });
    await adapter.set("theme", { mode: "dark" });
    await adapter.set("session", { validUntil: 2 });

    expect(derivationsOf("session")).toBe(1);
    expect(derivationsOf("theme")).toBe(1);
    expect(await adapter.get("theme")).toEqual({ mode: "dark" });
  });

  it("shares one derivation between writes made at the same time", async () => {
    const adapter = setup.create();
    await Promise.all([1, 2, 3].map((n) => adapter.set(`k${n % 1}`, { n })));
    expect(derivationsOf("k0")).toBe(1);
  });

  it("reads, in a new adapter (another tab, a reload), what another one wrote", async () => {
    await setup.create().set("session", { validUntil: 42 });
    expect(await setup.create().get("session")).toEqual({ validUntil: 42 });
  });

  it("does not keep a failed derivation — the next write derives again and succeeds", async () => {
    const adapter = setup.create();
    cryptoHelper.deriveKey.mockRejectedValueOnce(new Error("crypto busy"));

    expect(await adapter.set("session", { validUntil: 1 })).toBe(false);
    expect(await adapter.set("session", { validUntil: 2 })).toBe(true);

    expect(await adapter.get("session")).toEqual({ validUntil: 2 });
    expect(derivationsOf("session")).toBe(2);
  });

  if (setup.raw !== null) {
    it("stores what the previous version stored — it opens the old way", async () => {
      const adapter = setup.create();
      await adapter.set("session", { validUntil: 7 });

      const stored = setup.raw().getItem(adapter._fullKey("session"));

      expect(await decryptLikeBefore("session", stored)).toEqual({ validUntil: 7 });
    });

    it("opens what the previous version stored", async () => {
      const adapter = setup.create();
      setup.raw().setItem(adapter._fullKey("session"), await encryptLikeBefore("session", { validUntil: 9 }));

      expect(await adapter.get("session")).toEqual({ validUntil: 9 });
    });
  }
});
