// vite.config.js
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.js'),
      name: 'Storagefy',
      fileName: (format) => `storagefy.${format}.js`,
      formats: ['es', 'cjs']
    },
    outDir: 'dist',
    rollupOptions: {
      output: {
        globals: {
          react: 'React',
          pinia: 'Pinia',
          zustand: 'Zustand',
          redux: 'Redux',
          jotai: 'Jotai',
          svelte: 'Svelte'
        }
      }
    }
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.{test,spec}.js'],
    // Real browsers, with Playwright (npm run test:browser): not run by Vitest
    exclude: ['tests/browser/**', 'node_modules/**'],
    // Every line, branch and function of the library is tested: `npx vitest run --coverage` fails below 100%
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
