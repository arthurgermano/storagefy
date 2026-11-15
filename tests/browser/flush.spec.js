// flush in a real browser: once it answers, the state is stored — a reload or a closed tab right after loses nothing,
// and the other tabs hear the change once. Pinia tells a direct change in a later task: flush writes it all the same.
import { test, expect } from "@playwright/test";
import { openTab, reloadTab, eventually, expectNoPageErrors } from "./tabs.js";

/** Encrypted, as an app that keeps a person's data does */
const storageOptions = { encrypt: true, password: "app-secret" };

/** Keeps a Pinia store "user" in a tab */
function keepUser(page, storage) {
  return page.evaluate(
    ({ storage, storageOptions }) =>
      window.lab.keep("user", { library: "pinia", storage, initial: { name: "Ana", draft: "" }, storageOptions }),
    { storage, storageOptions },
  );
}

/** Clears the store with a direct change — told by Pinia in a later task — then flushes it, in the same task */
function clearAndFlush(page) {
  return page.evaluate(() => {
    const { store, storeAdapter } = window.lab.kept.user;
    store.name = null;
    return storeAdapter.flush("user");
  });
}

/** What the storage holds under "user", read by an adapter of its own */
function readStored(page, storage) {
  return page.evaluate(
    ({ storage, storageOptions }) => window.lab.openStorage(storage, storageOptions).get("user"),
    { storage, storageOptions },
  );
}

for (const storage of ["localStorage", "indexedDB"]) {
  test(`pinia + ${storage} — a direct change, flushed: a reload right after finds it stored`, async ({ context }) => {
    const page = await openTab(context);
    await keepUser(page, storage);

    expect(await clearAndFlush(page)).toBe(true);
    await reloadTab(page);

    expect(await readStored(page, storage)).toEqual({ name: null, draft: "" });
    expectNoPageErrors(page);
  });

  test(`pinia + ${storage} — a direct change, flushed: the tab closed right after, another tab finds it stored`, async ({ context }) => {
    const page = await openTab(context);
    await keepUser(page, storage);

    expect(await clearAndFlush(page)).toBe(true);
    expectNoPageErrors(page);
    await page.close();

    const next = await openTab(context);
    expect(await readStored(next, storage)).toEqual({ name: null, draft: "" });
  });

  test(`pinia + ${storage} — a flush in one tab reaches the other once, and is written once`, async ({ context }) => {
    const [here, there] = [await openTab(context), await openTab(context)];
    await keepUser(here, storage);
    await keepUser(there, storage);
    await there.evaluate(() => {
      window.heard = 0;
      window.lab.kept.user.storageAdapter.onDataChanged((change) => {
        if (change.key === "user") {
          window.heard += 1;
        }
      });
    });

    expect(await clearAndFlush(here)).toBe(true);

    await eventually(there, () => window.lab.read("user"), { name: null, draft: "" });
    // Time for a second write or message, if there were one
    await here.waitForTimeout(300);
    expect(await there.evaluate(() => window.heard)).toBe(1);
    expect(await here.evaluate(() => window.lab.kept.user.writes)).toBe(1);
    expectNoPageErrors(here, there);
  });
}
