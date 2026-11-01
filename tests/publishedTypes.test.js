// @vitest-environment node
import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------------------------------------------
// The published types (dist/types — run `npm run build` first) as a TypeScript app sees them: tests/types/usage.ts
// compiles with `strict` and without skipLibCheck, and every misuse it lists is refused.
// ------------------------------------------------------------------------------------------------

const root = fileURLToPath(new URL("..", import.meta.url));
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");

describe("published types", () => {
  it("compile an app's use of the library, and refuse its misuses", () => {
    const result = spawnSync(process.execPath, [tsc, "-p", "tests/types/tsconfig.json"], { cwd: root, encoding: "utf8" });
    expect(result.stdout + result.stderr).toBe("");
    expect(result.status).toBe(0);
  }, 60_000);
});
