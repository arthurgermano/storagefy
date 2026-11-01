// Sync between real tabs: pages of one browser context — a real BroadcastChannel, a shared localStorage and
// IndexedDB, a sessionStorage of each tab's own.
import { test, expect } from "@playwright/test";
import { openTab, reloadTab, eventually, expectNoPageErrors } from "./tabs.js";

const readStore = (key) => window.lab.read(key);
const keepIn = (page, key, how) => page.evaluate(({ key, how }) => window.lab.keep(key, how), { key, how });
const changeIn = (page, key, state) => page.evaluate(({ key, state }) => window.lab.change(key, state), { key, state });
const writesIn = (page, key) => page.evaluate((key) => window.lab.kept[key].writes, key);
const errorsIn = (page, key) => page.evaluate((key) => window.lab.kept[key].errors, key);

const LIBRARIES = ["pinia", "svelte", "zustand"];

for (const storage of ["localStorage", "indexedDB"]) {
  for (const library of LIBRARIES) {
    test(`${library} + ${storage} — a change in one tab reaches the other, and is not written back`, async ({ context }) => {
      const [here, there] = [await openTab(context), await openTab(context)];
      for (const tab of [here, there]) {
        await keepIn(tab, "cart", { library, storage, initial: { items: [] } });
      }

      await changeIn(here, "cart", { items: ["apple"] });

      await eventually(there, readStore, { items: ["apple"] }, "cart");
      // The tab that applied it wrote nothing; the tab that changed it wrote once
      await there.waitForTimeout(150);
      expect([await writesIn(here, "cart"), await writesIn(there, "cart")]).toEqual([1, 0]);
      expectNoPageErrors(here, there);
    });
  }
}

test("svelte + localStorage — an array and a number reach the other tab as they are", async ({ context }) => {
  const [here, there] = [await openTab(context), await openTab(context)];
  for (const tab of [here, there]) {
    await keepIn(tab, "list", { library: "svelte", storage: "localStorage", initial: ["a"] });
    await keepIn(tab, "count", { library: "svelte", storage: "localStorage", initial: 0 });
  }

  await changeIn(here, "list", ["b", "c"]);
  await changeIn(here, "count", 7);

  await eventually(there, readStore, ["b", "c"], "list");
  await eventually(there, readStore, 7, "count");
});

test("pinia + sessionStorage (encrypted) — each tab keeps its own storage; the change comes with the message", async ({ context }) => {
  const [here, there] = [await openTab(context), await openTab(context)];
  const storageOptions = { encrypt: true, password: "app-secret" };
  for (const tab of [here, there]) {
    await keepIn(tab, "cart", { library: "pinia", storage: "sessionStorage", initial: { n: 0 }, storageOptions });
  }

  await changeIn(here, "cart", { n: 1 });

  await eventually(there, readStore, { n: 1 }, "cart");
  const storedThere = await there.evaluate(() => window.lab.kept.cart.storageAdapter.get("cart"));
  expect(storedThere).toEqual({ n: 0 }); // applied to the store, not to that tab's sessionStorage
});

test("pinia + sessionStorage (encrypted) — a large change then a small one: the other tab ends with the small one", async ({ context }) => {
  const [here, there] = [await openTab(context), await openTab(context)];
  const storageOptions = { encrypt: true, password: "app-secret" };
  for (const tab of [here, there]) {
    await keepIn(tab, "cart", { library: "pinia", storage: "sessionStorage", initial: { items: [], n: 0 }, storageOptions });
  }

  await here.evaluate(async () => {
    const adapter = window.lab.kept.cart.storageAdapter;
    // Two writes in a row, not awaited one by one: the messages leave one after the other
    await Promise.all([
      adapter.set("cart", { items: Array.from({ length: 200_000 }, (_, index) => index), n: 1 }),
      adapter.set("cart", { items: [], n: 2 }),
    ]);
  });

  await eventually(there, (key) => window.lab.read(key).n, 2, "cart");
  await there.waitForTimeout(500);
  expect(await there.evaluate((key) => window.lab.read(key).n, "cart")).toBe(2);
});

test("two namespaces on one channel do not mix their states", async ({ context }) => {
  const [appA, appB] = [await openTab(context), await openTab(context)];
  await keepIn(appA, "cart", { library: "svelte", storage: "sessionStorage", initial: { items: 1 }, storageOptions: { dbName: "appA" } });
  await keepIn(appB, "cart", { library: "svelte", storage: "sessionStorage", initial: { items: 1 }, storageOptions: { dbName: "appB" } });

  await changeIn(appB, "cart", { items: 99 });
  await appA.waitForTimeout(300);

  expect(await appA.evaluate(readStore, "cart")).toEqual({ items: 1 });
});

test("a store emptied on sign-out (null) is not loaded back after a reload", async ({ context }) => {
  const page = await openTab(context);
  await keepIn(page, "user", { library: "svelte", storage: "localStorage", initial: { name: "Ana" } });
  await changeIn(page, "user", null);
  await page.waitForTimeout(100);

  await reloadTab(page);
  await keepIn(page, "user", { library: "svelte", storage: "localStorage", initial: null, load: true });

  expect(await page.evaluate(() => [window.lab.kept.user.loaded, window.lab.read("user")])).toEqual([false, null]);
});

test("a store reloaded with its state kept", async ({ context }) => {
  const page = await openTab(context);
  await keepIn(page, "cart", { library: "zustand", storage: "indexedDB", initial: { items: [] } });
  await changeIn(page, "cart", { items: ["apple"] });
  await page.waitForTimeout(100);

  await reloadTab(page);
  await keepIn(page, "cart", { library: "zustand", storage: "indexedDB", initial: { items: [] }, load: true });

  expect(await page.evaluate(() => [window.lab.kept.cart.loaded, window.lab.read("cart")])).toEqual([true, { items: ["apple"] }]);
  expect(await errorsIn(page, "cart")).toEqual([]);
});
