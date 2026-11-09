/**
 * Checks the built page in headless Chromium: axe finds no WCAG 2.1 A or AA
 * violations at desktop and phone widths, the phone layout has no sideways
 * scroll and keeps its 16px gutter, the page is complete with JavaScript off,
 * and reduced motion keeps the posters. It only reads what its own headless
 * browser renders.
 *
 *   pnpm --filter @kireimanga/landing build
 *   pnpm --filter @kireimanga/landing check:page
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { preview } from 'astro';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await preview({ root, logLevel: 'error', server: { port: 4393 } });
const url = 'http://localhost:4393/';
const browser = await chromium.launch();
const problems = [];
const check = (ok, message) => {
  if (!ok) problems.push(message);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${message}`);
};

async function axe(page, label) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  for (const v of result.violations) {
    console.log(`  ${v.id}: ${v.help} (${v.nodes.length})`);
    for (const node of v.nodes.slice(0, 3)) console.log(`    ${node.target.join(' ')}`);
  }
  check(
    result.violations.length === 0,
    `${label}: axe WCAG 2.1 AA, ${result.violations.length} violations`
  );
}

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
      scrollTo(0, y);
      await new Promise(r => setTimeout(r, 60));
    }
    scrollTo(0, 0);
  });
}

try {
  for (const [label, viewport] of [
    ['desktop', { width: 1440, height: 900 }],
    ['phone', { width: 390, height: 844 }],
    ['small phone', { width: 320, height: 640 }],
  ]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'load' });
    await scrollThrough(page);
    await axe(page, label);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(overflow <= 0, `${label}: no sideways scroll (${overflow}px over)`);
    if (viewport.width < 900) {
      const minLeft = await page.evaluate(() =>
        Math.min(
          ...[...document.querySelectorAll('main h1, main h2, main p, main a.btn')]
            .filter(
              el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden'
            )
            .map(el => el.getBoundingClientRect().left)
        )
      );
      check(minLeft >= 16, `${label}: 16px gutter (leftmost text at ${Math.round(minLeft)}px)`);
    }
    await context.close();
  }

  const noJs = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 900 },
  });
  const page = await noJs.newPage();
  await page.goto(url, { waitUntil: 'load' });
  check(await page.locator('h1').isVisible(), 'no JS: hero heading visible');
  check(
    await page.evaluate(() => {
      const img = document.querySelector('img[data-poster="0"]');
      return Boolean(img && img.complete && img.naturalWidth > 0);
    }),
    'no JS: hero poster loaded'
  );
  check(
    (await page.locator('a[href*="/releases/latest"]').count()) >= 2,
    'no JS: download links present'
  );
  check(await page.locator('#features h2').isVisible(), 'no JS: features visible');
  await noJs.close();

  const reduced = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1440, height: 900 },
  });
  const rp = await reduced.newPage();
  await rp.goto(url, { waitUntil: 'load' });
  await rp.waitForTimeout(500);
  check(
    (await rp.locator('[data-tour]').getAttribute('data-scene-reason')) === 'reduced-motion',
    'reduced motion: posters kept'
  );
  await reduced.close();
} finally {
  await browser.close();
  await server.stop();
}

if (problems.length) {
  console.error(`\n${problems.length} check(s) failed`);
  process.exit(1);
}
