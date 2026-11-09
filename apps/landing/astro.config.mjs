// @ts-check
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';
import { existsSync, readdirSync } from 'node:fs';

// The 3D files are optional: a missing prop keeps its procedural blockout and
// a missing mascot keeps the flat Kirei stand-in. Checked here, where
// import.meta.url is this file, because a component's import.meta.url points
// into the build output once it is bundled.
const public3d = new URL('./public/3d/', import.meta.url);
const mascotGlb = existsSync(new URL('mascot.glb', public3d)) ? '/3d/mascot.glb' : '';
const propsDir = new URL('props/', public3d);
const propFiles = existsSync(propsDir)
  ? readdirSync(propsDir)
      .filter(f => f.endsWith('.glb'))
      .map(f => f.slice(0, -4))
  : [];

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
      'import.meta.env.MASCOT_GLB': JSON.stringify(mascotGlb),
      'import.meta.env.PROP_FILES': JSON.stringify(propFiles.join(',')),
    },
    resolve: {
      alias: {
        '@': new URL('./src', import.meta.url).pathname,
      },
    },
  },
});
