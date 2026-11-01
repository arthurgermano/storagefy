// The life of an adapter in a real browser: a newer IndexedDB version opened in another tab, the expiry watcher on
// real timers, destroy().
import { test, expect } from "@playwright/test";
import { openTab, eventually, expectNoPageErrors } from "./tabs.js";

test("indexedDB — a newer version opened in another tab: the older tab closes and says why, the newer one opens", async ({ context }) => {
  const [older, newer] = [await openTab(context), await openTab(context)];
  await older.evaluate(async () => {
    window.lab.kept.older = window.lab.openStorage("indexedDB");
    await window.lab.kept.older.set("cart", { items: 1 });
  });

  const read = await newer.evaluate(async () => {
    const adapter = window.lab.openStorage("indexedDB", { version: 2 });
    await adapter.waitReadiness(50, 100);
    return adapter.get("cart");
  });
  expect(read).toEqual({ items: 1 });

  const afterwards = await older.evaluate(async () => {
    const adapter = window.lab.kept.older;
    const errors = [];
    return {
      written: await adapter.set("cart", { items: 2 }),
      read: await adapter.get("cart", { onError: (error) => errors.push(error.cause.message) }),
      errors,
    };
  });
  expect(afterwards).toEqual({
    written: false,
    read: null,
    errors: ['Storagefy: the IndexedDB database "app" was upgraded by another tab — reload the page'],
  });
  expectNoPageErrors(older, newer);
});

test("indexedDB — the same database opened with another store name is refused with the reason, never left waiting", async ({ context }) => {
  const page = await openTab(context);
  const result = await page.evaluate(async () => {
    await window.lab.openStorage("indexedDB", { storeName: "storagefy_db" }).set("cart", 1);
    const other = window.lab.openStorage("indexedDB");
    const errors = [];
    return {
      written: await other.set("cart", 2),
      ready: await other.waitReadiness().then(() => "ready", (error) => error.message),
      read: await other.get("cart", { onError: (error) => errors.push(error.cause.message) }),
      errors,
    };
  });
  const reason =
    'Storagefy: the IndexedDB database "app" (version 1) has no object store "app_store" — open it with the storeName ' +
    "it was created with, or raise version to create it";
  expect(result).toEqual({ written: false, ready: reason, read: null, errors: [reason] });
});

for (const storage of ["localStorage", "indexedDB"]) {
  test(`${storage} — the expiry watcher removes an expired key on real timers, and keeps one written again`, async ({ context }) => {
    const page = await openTab(context);
    await page.evaluate(async (storage) => {
      const adapter = window.lab.openStorage(storage, { expireCheckInterval: 50 });
      window.lab.kept.watched = adapter;
      await adapter.set("short", "gone soon", 100);
      await adapter.set("renewed", "first", 100);
    }, storage);

    // Written again just as it expires: the new expiration wins over the one the watcher saw
    await page.waitForTimeout(90);
    await page.evaluate(() => window.lab.kept.watched.set("renewed", "second", 60_000));

    await eventually(page, () => window.lab.kept.watched.has("short"), false);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.lab.kept.watched.get("renewed"))).toBe("second");
    await page.evaluate(() => window.lab.kept.watched.destroy());
  });
}

test("destroy — the tab stops hearing the others, and its IndexedDB connection is closed", async ({ context }) => {
  const [here, there] = [await openTab(context), await openTab(context)];
  for (const tab of [here, there]) {
    await tab.evaluate(() => window.lab.keep("cart", { library: "svelte", storage: "indexedDB", initial: { items: 0 } }));
  }

  await here.evaluate(() => window.lab.kept.cart.storageAdapter.destroy());
  await there.evaluate(() => window.lab.change("cart", { items: 5 }));
  await here.waitForTimeout(300);
  expect(await here.evaluate(() => window.lab.read("cart"))).toEqual({ items: 0 });

  // With every connection closed the database can be deleted at once — an open one would block it
  await there.evaluate(() => window.lab.kept.cart.storageAdapter.destroy());
  const deletion = await here.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase("app");
        request.onblocked = () => resolve("blocked");
        request.onsuccess = () => resolve("deleted");
        request.onerror = () => resolve("error");
      }),
  );
  expect(deletion).toBe("deleted");
});
