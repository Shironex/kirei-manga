// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { existsSync } from 'node:fs';

// The scene files are optional: until they are dropped into public/3d the
// island builds its placeholder desk and the flat Kirei stand-in. Checked
// here, where import.meta.url is this file, because a component's
// import.meta.url points into the build output once it is bundled.
/** @param {string} file */
const optional3d = file =>
  existsSync(new URL(`./public/3d/${file}`, import.meta.url)) ? `/3d/${file}` : '';

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
    define: {
      'import.meta.env.SCENE_GLB': JSON.stringify(optional3d('scene.glb')),
      'import.meta.env.MASCOT_GLB': JSON.stringify(optional3d('mascot.glb')),
    },
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});
