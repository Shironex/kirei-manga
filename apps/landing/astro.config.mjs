// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.KIREIMANGA_SITE_URL || 'https://kireimanga.app',
  // React only runs inside the 3D hero, which mounts itself after the GPU
  // gate in src/tour/startTour.ts. No page ships React unless that gate passes.
  integrations: [react(), sitemap()],
  build: {
    // The whole stylesheet is small (about 13 kB gzipped), so it goes inline
    // and the first paint on a slow phone needs no extra round trip.
    inlineStylesheets: 'always',
  },
  vite: {
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});
