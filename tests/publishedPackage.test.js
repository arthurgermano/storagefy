// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { build } from "esbuild";

// ------------------------------------------------------------------------------------------------
// The package as published (dist — run `npm run build` first): the ESM build is one file per module, so an app keeps
// only the adapters it imports ("sideEffects": false); the CommonJS build stays a single file; both export the same
// names as the sources; importing does nothing by itself.
// ------------------------------------------------------------------------------------------------

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);

beforeAll(() => {
  if (!existsSync(`${root}dist/index.js`)) {
    throw new Error("dist not built — run `npm run build` before these tests");
  }
});

/** The names exported by the sources — what both builds must export */
const SOURCE_EXPORTS = [
  "IndexedDBAdapter",
  "LocalStorageAdapter",
  "PiniaAdapter",
  "ReactAdapter",
  "SessionStorageAdapter",
  "SvelteAdapter",
  "getPiniaAdapter",
  "getReactAdapter",
  "getStorageAdapter",
  "getSvelteAdapter",
  "setPiniaStorage",
  "setReactStorage",
  "setSvelteStorage",
  "startStoragefy",
];

describe("published package", () => {
  it("exports the same names as the sources — ESM and CommonJS", async () => {
    const source = await import("../src/index.js");
    const esm = await import("../dist/index.js");
    const cjs = require("../dist/index.cjs");

    expect(Object.keys(source).sort()).toEqual(SOURCE_EXPORTS);
    expect(Object.keys(esm).sort()).toEqual(SOURCE_EXPORTS);
    expect(Object.keys(cjs).sort()).toEqual(SOURCE_EXPORTS);
  });

  it("lets an app keep only what it imports — localStorage and Pinia leave the other adapters out", async () => {
    const result = await build({
      stdin: {
        contents: 'import { LocalStorageAdapter, PiniaAdapter } from "storagefy"; globalThis.kept = [LocalStorageAdapter, PiniaAdapter];',
        resolveDir: root,
      },
      // Resolves "storagefy" as an app does: through package.json (exports, sideEffects)
      alias: { storagefy: root },
      bundle: true,
      minify: true,
      format: "esm",
      platform: "browser",
      write: false,
      metafile: true,
    });
    // Every file esbuild read is an input; only those that left code in the output were kept
    const [output] = Object.values(result.metafile.outputs);
    const bundled = Object.entries(output.inputs)
      .filter(([, input]) => input.bytesInOutput > 0)
      .map(([file]) => file);

    expect(bundled.some((file) => file.endsWith("dist/adapters/LocalStorageAdapter.js"))).toBe(true);
    expect(bundled.some((file) => file.endsWith("dist/stores/PiniaAdapter.js"))).toBe(true);
    for (const left of ["IndexedDBAdapter", "SessionStorageAdapter", "ReactAdapter", "SvelteAdapter"]) {
      expect(bundled.some((file) => file.includes(left))).toBe(false);
    }
  });

  it("keeps a debug setting made before the import", async () => {
    globalThis.storagefyDebug = true;
    globalThis.storagefyDebugLevel = 2;
    await import("../dist/helpers/loggerHelper.js?debug-kept");

    expect(globalThis.storagefyDebug).toBe(true);
    expect(globalThis.storagefyDebugLevel).toBe(2);
    globalThis.storagefyDebug = false;
    globalThis.storagefyDebugLevel = 0;
  });

  it("looks for Web Crypto only when encryption is used — importing needs none", async () => {
    const crypto = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    try {
      const helper = await import("../dist/helpers/cryptoHelper.js?no-crypto");
      await expect(helper.deriveKey("session")).rejects.toThrow("Crypto API not available");
    } finally {
      Object.defineProperty(globalThis, "crypto", crypto);
    }
  });
});
