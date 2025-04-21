import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import svelte from '@astrojs/svelte';
import vue from '@astrojs/vue';

export default defineConfig({
  site: 'https://arthurgermano.github.io/storagefy/',
  base: '/storagefy/',  
  integrations: [
    react(),
    svelte(),
    vue()
  ],
  // vite: {
  //   base: '/storagefy/',
  // }
});