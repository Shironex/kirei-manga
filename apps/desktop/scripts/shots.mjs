/**
 * Renders the app screenshots for the README and the landing from the real
 * React frontend in demo capture mode: `shots.html` swaps the Rust core for a
 * mock with a fixed demo library (src/shots). It builds that entry, serves it,
 * opens each view in headless Chromium and writes WebP with sharp. It only
 * saves what its own headless browser renders; it never captures the screen.
 *
 *   pnpm shots
 *
 * Chromium for Playwright is needed once:
 *   pnpm --filter @kireimanga/desktop exec playwright install chromium
 */
import { mkdir, rm, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { build, preview } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(root, '..', '..');
const outDir = join(repo, 'assets', 'screenshots');
const buildDir = join(root, 'dist-shots');
const port = 4392;

/** Must match NOW in src/shots/data.ts. */
const NOW = Date.UTC(2026, 10, 7, 19, 30);
const VIEWPORT = { width: 1440, height: 900 };
const UNHANDLED = '[shots] unhandled command';

/**
 * One entry per screenshot. `ready` is a selector that exists once the view
 * has its data; `act` runs after it, before the capture.
 */
const SHOTS = [
  {
    name: 'library',
    route: '/library',
    ready: 'section[aria-label="Continue reading"]',
  },
  {
    name: 'series',
    route: '/series/1',
    ready: '#main h1',
  },
  {
    name: 'reader-single',
    route: '/read/1/1042',
    ready: '[data-testid="reader"] img',
  },
  {
    name: 'reader-webtoon',
    route: '/read/3/3089',
    ready: '[data-testid="reader"] img',
    // Partway down, so the column shows one panel flowing into the next.
    act: async page => {
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await page.mouse.wheel(0, 400);
    },
  },
  {
    name: 'settings',
    route: '/settings',
    ready: '#main h1',
  },
  {
    name: 'browse',
    route: '/browse',
    ready: '#main img',
  },
  {
    name: 'online-series',
    route: '/online/d3m00002-6b1e-4c2a-9f00-000000000002',
    ready: '#main h1',
  },
  {
    name: 'command-palette',
    route: '/library',
    ready: 'section[aria-label="Continue reading"]',
    act: async page => {
      await page.keyboard.press('Meta+K');
      await page.waitForSelector('[role="dialog"]');
      await page.keyboard.type('moon', { delay: 20 });
    },
  },
  {
    name: 'stats',
    route: '/stats',
    ready: '#main h1',
  },
];

const only = process.argv.slice(2);

/** Every image on the page decoded, every font in use loaded. */
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    await Promise.all(images.map(img => (img.complete ? null : img.decode().catch(() => null))));
  });
  // Two frames for layout that reacts to the decoded sizes.
  await page.evaluate(
    () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  );
  await page.waitForTimeout(400);
}

async function main() {
  await rm(buildDir, { recursive: true, force: true });
  await build({
    root,
    logLevel: 'warn',
    build: {
      outDir: buildDir,
      emptyOutDir: true,
      rollupOptions: { input: join(root, 'shots.html') },
    },
  });
  const server = await preview({
    root,
    logLevel: 'warn',
    build: { outDir: buildDir },
    preview: { port, strictPort: true },
  });
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const failures = [];
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 2,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
      locale: 'en-US',
      timezoneId: 'UTC',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    });
    await context.clock.setFixedTime(NOW);
    // A seeded Math.random, so anything the UI shuffles comes out the same.
    await context.addInitScript(() => {
      let a = 0x2f6b1e;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    });
    await context.route(
      url => !url.href.startsWith(`http://localhost:${port}/`) && url.protocol.startsWith('http'),
      route => route.abort()
    );

    for (const shot of SHOTS) {
      if (only.length > 0 && !only.includes(shot.name)) continue;
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', error => problems.push(`page error: ${error.message}`));
      page.on('console', msg => {
        if (msg.text().startsWith(UNHANDLED)) problems.push(msg.text());
      });
      await page.goto(`http://localhost:${port}/shots.html#${shot.route}`);
      await page.waitForFunction(() => window.__SHOTS_READY__ === true, null, { timeout: 60_000 });
      await page.waitForSelector(shot.ready, { timeout: 20_000 });
      await settle(page);
      if (shot.act) {
        await shot.act(page);
        await settle(page);
      }
      // The pointer rests outside the window so no hover state shows.
      await page.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1);
      await page.waitForTimeout(200);
      const png = await page.screenshot({ animations: 'disabled', caret: 'hide' });
      const file = join(outDir, `${shot.name}.webp`);
      await sharp(png).webp({ quality: 86, effort: 6, smartSubsample: true }).toFile(file);
      const { size } = await stat(file);
      console.log(
        `${shot.name.padEnd(16)} ${relative(repo, file)}  ${(size / 1024).toFixed(0)} kB`
      );
      if (problems.length > 0) failures.push(`${shot.name}:\n  ${problems.join('\n  ')}`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.httpServer.close(resolve));
    await rm(buildDir, { recursive: true, force: true });
  }
  if (failures.length > 0) {
    console.error(`\nThe demo app reported problems:\n${failures.join('\n')}`);
    process.exit(1);
  }
}

await main();
