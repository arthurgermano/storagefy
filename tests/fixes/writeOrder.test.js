import { describe, it, expect, afterEach, vi } from "vitest";
import { STORAGE_NAMES, freshStorage, openStorage, closeAll } from "../__fixtures__/storages.js";

// ------------------------------------------------------------------------------------------------
// Writes of a key land in the order they were asked. The encryption runs before the value is stored and takes its
// own time: up to 1.2.x two writes in a row could finish in the reverse order, and the older value stayed stored.
// ------------------------------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Makes the first encryption from now on take longer than the ones after it */
function slowFirstEncryption() {
  const realEncrypt = crypto.subtle.encrypt.bind(crypto.subtle);
  let calls = 0;
  return vi.spyOn(crypto.subtle, "encrypt").mockImplementation(async (...args) => {
    calls += 1;
    if (calls === 1) {
      await sleep(40);
    }
    return realEncrypt(...args);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  closeAll();
});

describe.each(STORAGE_NAMES)("%s — the order of writes", (name) => {
  it("keeps the newer value when the older one takes longer to encrypt", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });
    // The key is derived once, before the race
    await adapter.set("cart", { items: 0 });
    slowFirstEncryption();

    await Promise.all([adapter.set("cart", { items: 1 }), adapter.set("cart", { items: 2 })]);

    expect(await adapter.get("cart")).toEqual({ items: 2 });
  });

  it("a delete asked after a write removes the key, however long the write takes", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });
    await adapter.set("cart", { items: 0 });
    slowFirstEncryption();

    await Promise.all([adapter.set("cart", { items: 1 }), adapter.delete("cart")]);

    expect(await adapter.get("cart")).toBeNull();
  });

  it("a write that fails does not stop the ones after it", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });
    await adapter.set("cart", { items: 0 });
    vi.spyOn(crypto.subtle, "encrypt").mockRejectedValueOnce(new Error("crypto busy"));

    const [first, second] = await Promise.all([adapter.set("cart", { items: 1 }), adapter.set("cart", { items: 2 })]);

    expect([first, second]).toEqual([false, true]);
    expect(await adapter.get("cart")).toEqual({ items: 2 });
  });

  it("writes of different keys do not wait for each other", async () => {
    freshStorage(name);
    const adapter = openStorage(name, { encrypt: true, password: "app-secret" });
    await adapter.set("slow", 0);
    await adapter.set("fast", 0);
    slowFirstEncryption();

    const done = [];
    await Promise.all([
      adapter.set("slow", 1).then(() => done.push("slow")),
      adapter.set("fast", 1).then(() => done.push("fast")),
    ]);

    expect(done).toEqual(["fast", "slow"]);
  });
});
