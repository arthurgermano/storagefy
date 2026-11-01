import { describe, it, expect, beforeEach, vi } from "vitest";
import { Window } from "happy-dom";

// ------------------------------------------------------------------------------------------------
// The entry point (src/index.js):
//   - setPiniaStorage / setReactStorage / setSvelteStorage reject with the real error. Up to 1.2.x their error path
//     called a logError that was never imported: every error became "ReferenceError: logError is not defined"
//   - startStoragefy({ fresh: true }) returns a new adapter. Up to 1.2.x it returned the one already started
// ------------------------------------------------------------------------------------------------

/** The entry point as a fresh import: nothing started */
async function freshEntryPoint() {
  vi.resetModules();
  globalThis.localStorage = new Window().localStorage;
  return import("../../src/index.js");
}

describe("set*Storage — the real error", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["setPiniaStorage", "setReactStorage", "setSvelteStorage"])("%s rejects a missing store with its own message", async (name) => {
    const storagefy = await freshEntryPoint();
    const adapter = storagefy.startStoragefy({ adapter: "localStorage", expireCheckInterval: 0 });

    await expect(storagefy[name](null, "key")).rejects.toThrow("Store is required.");
    await expect(storagefy[name]({}, "")).rejects.toThrow("Key is required.");
    adapter.destroy();
  });
});

describe("startStoragefy — fresh", () => {
  it("returns a new adapter, and keeps the one started", async () => {
    const storagefy = await freshEntryPoint();
    const started = storagefy.startStoragefy({ adapter: "localStorage", expireCheckInterval: 0 });

    const fresh = storagefy.startStoragefy({ adapter: "localStorage", expireCheckInterval: 0, fresh: true });

    expect(fresh).not.toBe(started);
    expect(storagefy.getStorageAdapter()).toBe(started);
    started.destroy();
    fresh.destroy();
  });
});
