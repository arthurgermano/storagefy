// Serves the browser tests' page (tests/browser/page) and the package as published (dist) from the project root.
// The store libraries are bundled before the first page opens: found on the fly, Vite would reload the page in the
// middle of a test.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default defineConfig({
  root,
  logLevel: "warn",
  server: { fs: { allow: [root] } },
  optimizeDeps: {
    entries: ["tests/browser/page/index.html"],
    include: ["misc-helpers", "pinia", "vue", "svelte/store", "zustand/vanilla"],
  },
});
