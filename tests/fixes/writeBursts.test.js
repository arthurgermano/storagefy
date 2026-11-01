import { describe, it, expect, afterEach, vi } from "vitest";
import { createPinia, defineStore } from "pinia";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll } from "../__fixtures__/storages.js";
import PiniaAdapter from "../../src/stores/PiniaAdapter.js";

// ------------------------------------------------------------------------------------------------
// A burst of changes to a store costs one write after the one in progress — never one write per change — and the
// last state is the one stored. Up to 1.2.x every change was encrypted and written.
// ------------------------------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

describe.each(STORAGE_NAMES)("%s — bursts of changes", (name) => {
  it("writes a burst of 20 changes in at most two writes, and stores the last state", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });
    const store = defineStore("counter", { state: () => ({ count: 0 }) })(createPinia());
    await new PiniaAdapter(adapter).setInStorage(store, "counter");
    const writes = vi.spyOn(adapter, "set");

    for (let count = 1; count <= 20; count += 1) {
      store.$patch({ count });
    }
    await vi.waitFor(async () => {
      expect(await adapter.get("counter")).toEqual({ count: 20 });
    });

    expect(writes.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
