// The library in real browsers — Chromium, Firefox and WebKit (Safari's engine), with real tabs: tests/browser.
// The page loads the package as published (dist — run `npm run build` first), served by Vite, which also serves the
// store libraries from node_modules. Every test gets a browser context of its own: storage starts empty, and the
// pages of one context are the tabs of one app (they share localStorage, IndexedDB and BroadcastChannel; each has its
// own sessionStorage).
import { defineConfig, devices } from "@playwright/test";

const PORT = 4179;

export default defineConfig({
  testDir: "tests/browser",
  testMatch: "**/*.spec.js",
  fullyParallel: true,
  forbidOnly: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `npx vite --config tests/browser/vite.config.js --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/tests/browser/page/index.html`,
    reuseExistingServer: false,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
