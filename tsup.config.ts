// tsup.config.ts
import { defineConfig } from 'tsup';

// Two builds of the same sources, one per module system. Types come from tsc over the JSDoc (tsconfig.types.json) —
// tsup's dts step copied the JavaScript instead. The dist folder is emptied by the build script before both run
// (they run together: a clean in either could remove what the other wrote).
export default defineConfig([
  {
    // ESM — one file per module, as in src: a bundler keeps only the adapters an app imports ("sideEffects": false).
    // A single bundled file held every adapter together: an app persisting one Pinia store to localStorage shipped
    // IndexedDB, sessionStorage, React and Svelte as well. Not minified: the app's bundler minifies
    entry: ['src/**/*.js'],
    format: ['esm'],
    bundle: false,
    dts: false,
    sourcemap: true,
    clean: false,
    minify: false,
    outDir: 'dist',
    target: 'esnext',
    platform: 'neutral',
  },
  {
    // CommonJS — a single file, as before: require() loads everything anyway
    entry: ['src/index.js'],
    format: ['cjs'],
    dts: false,
    sourcemap: true,
    clean: false,
    minify: true,
    splitting: false,
    outDir: 'dist',
    target: 'esnext',
  },
]);
