// The storage adapters in a real browser: real localStorage, sessionStorage and IndexedDB (its transactions — the value
// and its expiration in one), the real Web Crypto API (HKDF and PBKDF2), a reload of the page.
import { test, expect } from "@playwright/test";
import { STORAGES, openTab, reloadTab, expectNoPageErrors } from "./tabs.js";

const ENCRYPTIONS = {
  plain: {},
  hkdf: { encrypt: true, password: "app-secret" },
  pbkdf2: { encrypt: true, password: "app-secret", keyDerivation: "pbkdf2" },
};

for (const storage of STORAGES) {
  for (const [encryption, options] of Object.entries(ENCRYPTIONS)) {
    test(`${storage} (${encryption}) — writes, reads, lists, expires and resets`, async ({ context }) => {
      const page = await openTab(context);

      const result = await page.evaluate(
        async ({ storage, options }) => {
          const adapter = window.lab.openStorage(storage, options);
          const out = {};
          out.written = await adapter.set("users__1", { name: "Ana", tags: ["ç", "😀"] });
          await adapter.set("users__2", { name: "Bia" });
          await adapter.set("theme", "dark", 60_000);
          out.read = await adapter.get("users__1");
          out.table = (await adapter.getAll("users")).map(({ key }) => key).sort();
          out.expiresLater = (await adapter.getExpire("theme")) > Date.now();

          await adapter.setExpire("theme", Date.now() - 1);
          out.expired = [await adapter.has("theme"), await adapter.get("theme"), await adapter.getExpire("theme")];

          const large = "x".repeat(300_000);
          out.large = (await adapter.set("large", { large })) && (await adapter.get("large")).large.length;

          await adapter.set("fav-😀", "smile");
          await adapter.set("fav-😁", "grin");
          out.emoji = [await adapter.get("fav-😀"), await adapter.get("fav-😁")];

          // Another adapter on the same storage — the app opened again — reads what was written
          const again = window.lab.openStorage(storage, options);
          out.again = await again.get("users__2");

          // Encrypted: neither the values nor the key names are in plain sight — searched as JSON and with "__",
          // which base64 never holds (a short word alone may appear in a long base64 text by chance)
          if (storage !== "indexedDB") {
            const raw = Object.entries(window[storage]).flat().join(" ");
            out.plainSight = ['"name":"Ana"', "users__1"].map((text) => raw.includes(text));
          }

          await adapter.reset();
          out.afterReset = [await adapter.list(), await again.list()];
          await adapter.destroy();
          await again.destroy();
          return out;
        },
        { storage, options },
      );

      expect(result.written).toBe(true);
      expect(result.read).toEqual({ name: "Ana", tags: ["ç", "😀"] });
      expect(result.table).toEqual(["users__1", "users__2"]);
      expect(result.expiresLater).toBe(true);
      expect(result.expired).toEqual([false, null, null]);
      expect(result.large).toBe(300_000);
      expect(result.emoji).toEqual(["smile", "grin"]);
      expect(result.again).toEqual({ name: "Bia" });
      if (storage !== "indexedDB") {
        expect(result.plainSight).toEqual(encryption === "plain" ? [true, true] : [false, false]);
      }
      expect(result.afterReset).toEqual([[], []]);
      expectNoPageErrors(page);
    });
  }

  test(`${storage} — what is stored is there after the page reloads (encrypted)`, async ({ context }) => {
    const page = await openTab(context);
    const options = ENCRYPTIONS.hkdf;
    await page.evaluate(
      async ({ storage, options }) => {
        const adapter = window.lab.openStorage(storage, options);
        await adapter.set("cart", { items: [1, 2] });
        await adapter.destroy();
      },
      { storage, options },
    );

    await reloadTab(page);

    const read = await page.evaluate(
      async ({ storage, options }) => window.lab.openStorage(storage, options).get("cart"),
      { storage, options },
    );
    expect(read).toEqual({ items: [1, 2] });
  });

  test(`${storage} — a value written with another password reads as null, and onError says why`, async ({ context }) => {
    const page = await openTab(context);
    const result = await page.evaluate(async (storage) => {
      await window.lab.openStorage(storage, { encrypt: true, password: "first" }).set("cart", { items: 1 });
      const errors = [];
      const value = await window.lab
        .openStorage(storage, { encrypt: true, password: "second" })
        .get("cart", { onError: (error) => errors.push(error.message) });
      return { value, errors };
    }, storage);

    expect(result).toEqual({ value: null, errors: ['Storagefy: could not read "cart"'] });
  });
}

test("indexedDB — a write answers true once saved: another connection reads it at once", async ({ context }) => {
  const page = await openTab(context);
  const read = await page.evaluate(async () => {
    const writer = window.lab.openStorage("indexedDB");
    const reader = window.lab.openStorage("indexedDB");
    await reader.waitReadiness();
    await writer.set("cart", { items: 3 }, 60_000);
    return [await reader.get("cart"), (await reader.getExpire("cart")) > Date.now()];
  });
  expect(read).toEqual([{ items: 3 }, true]);
});
