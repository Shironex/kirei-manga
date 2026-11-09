/**
 * Renders the posters the page shows before, or instead of, the live 3D:
 * one frame per tour stop at 1920 by 1080 plus a 960 copy, the portrait
 * phone poster, and the 1200 by 630 social card. It opens the built site in
 * headless Chromium (?capture hides everything but the canvas and holds each
 * stop's exact framing) and writes WebP with sharp. It only saves what its
 * own headless browser renders; it never captures the screen.
 *
 *   pnpm --filter @kireimanga/landing build
 *   pnpm --filter @kireimanga/landing posters
 *
 * Run it again after the stops, the scene or the lighting change, and after
 * a file in /3d/props or /3d/mascot.glb is replaced.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'astro';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', '3d', 'posters');
await mkdir(out, { recursive: true });

const server = await preview({ root, logLevel: 'error', server: { port: 4391 } });
const base = 'http://localhost:4391/';
// The unsafe flag lets SwiftShader pass the strict GPU probe; real users on
// a software renderer still get the posters.
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

async function open(viewport, query) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.on('pageerror', err => console.error('page error:', err.message));
  await page.goto(`${base}${query}`, { waitUntil: 'load' });
  await page.waitForSelector('.tour.is-live', { timeout: 60_000 });
  return page;
}

const settle = page => page.waitForTimeout(900);

try {
  // One poster per stop.
  const wide = await open({ width: 1920, height: 1080 }, '?capture=stops');
  const count = await wide.locator('[data-stop-section]').count();
  for (let i = 0; i < count; i++) {
    await wide.evaluate(index => {
      const section = document.querySelector(`[data-stop-section="${index}"]`);
      window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY);
    }, i);
    await settle(wide);
    const png = await wide.locator('[data-canvas]').screenshot();
    await sharp(png)
      .webp({ quality: 80 })
      .toFile(join(out, `stop-${i}-1920.webp`));
    await sharp(png)
      .resize(960)
      .webp({ quality: 80 })
      .toFile(join(out, `stop-${i}-960.webp`));
    console.log(`stop ${i}`);
  }
  await wide.close();

  // The phone poster: the whole nook, rendered wider and scaled down.
  const phone = await open({ width: 1024, height: 1268 }, '?capture=mobile');
  await settle(phone);
  const phonePng = await phone.locator('[data-canvas]').screenshot();
  await sharp(phonePng)
    .resize(780, 966)
    .webp({ quality: 78 })
    .toFile(join(out, 'hero-mobile.webp'));
  console.log('phone');
  await phone.close();

  // The social card: the hero as a visitor sees it, copy included.
  const card = await open({ width: 1200, height: 630 }, '?capture=card');
  await card.evaluate(() => document.documentElement.classList.remove('capture'));
  await settle(card);
  const cardPng = await card.screenshot();
  await sharp(cardPng)
    .png({ compressionLevel: 9, palette: false })
    .toFile(join(root, 'public', 'og.png'));
  console.log('social card');
  await card.close();
} finally {
  await browser.close();
  await server.stop();
}
