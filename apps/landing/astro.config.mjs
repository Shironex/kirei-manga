// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.KIREIMANGA_SITE_URL || 'https://kireimanga.app',
  // React only runs inside the 3D hero, which mounts itself after the GPU
  // gate in src/hero/boot.ts. No page ships React unless that gate passes.
  integrations: [react(), sitemap()],
  build: {
    // Small stylesheets go inline, so the first paint needs no extra request.
    inlineStylesheets: 'auto',
  },
  vite: {
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});
