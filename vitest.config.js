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
  },
});
