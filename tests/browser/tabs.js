// The tabs of the browser tests: pages of one context are tabs of one app.
import { expect } from "@playwright/test";

/** The storage adapters, as the tests name them */
export const STORAGES = ["localStorage", "sessionStorage", "indexedDB"];

/**
 * Opens a tab of the app, with window.lab ready.
 * @param {import("@playwright/test").BrowserContext} context
 * @returns {Promise<import("@playwright/test").Page>}
 */
export async function openTab(context) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error));
  page.labErrors = errors;
  await page.goto("/tests/browser/page/index.html");
  await page.waitForFunction(() => window.labReady === true);
  return page;
}

/**
 * Reloads a tab — the app starts again: what is in memory is gone, what is stored stays.
 * @param {import("@playwright/test").Page} page
 */
export async function reloadTab(page) {
  await page.reload();
  await page.waitForFunction(() => window.labReady === true);
}

/**
 * Waits until a value read in a page is the one expected (changes between tabs arrive on their own).
 * @param {import("@playwright/test").Page} page
 * @param {Function} read - Runs in the page.
 * @param {unknown} expected
 * @param {unknown} [arg]
 */
export async function eventually(page, read, expected, arg) {
  await expect.poll(() => page.evaluate(read, arg), { timeout: 5000 }).toEqual(expected);
}

/**
 * No error was thrown in the page outside what the test awaited.
 * @param {import("@playwright/test").Page[]} pages
 */
export function expectNoPageErrors(...pages) {
  for (const page of pages) {
    expect(page.labErrors.map(String)).toEqual([]);
  }
}
