/**
 * Performance budget for the built site: for every page in dist it adds up
 * what a visitor downloads for the first view (HTML, CSS, eager JS, preloaded
 * fonts and images, eager images) and, separately, the 3D island that only
 * desktop class devices fetch after load. Text is counted gzipped, binaries
 * as they are. Fails when a number goes over its budget.
 *
 *   pnpm --filter @kireimanga/landing build
 *   pnpm --filter @kireimanga/landing check:budget
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Budgets in kB. */
const BUDGET = {
  firstViewJs: 15,
  firstViewTotal: 450,
  // three, React Three Fiber and React: one chunk, fetched after load.
  islandJs: 400,
  // The scene files and the decoders they need, fetched with the island.
  islandAssets: 1600,
};

/** What the island fetches besides its JS: the GLBs present and, with them, the Basis transcoder. */
function islandAssets() {
  const files = ['3d/scene.glb', '3d/mascot.glb']
    .map(f => join(dist, f))
    .filter(f => existsSync(f));
  if (files.length) {
    files.push(join(dist, '3d/decoders/basis/basis_transcoder.js'));
    files.push(join(dist, '3d/decoders/basis/basis_transcoder.wasm'));
  } else {
    files.push(join(dist, '3d/kirei-standin.webp'));
  }
  return files.filter(f => existsSync(f));
}

const TEXT = /\.(html|css|js|mjs|json|svg|txt|xml)$/;
const kb = bytes => Math.round((bytes / 1024) * 10) / 10;

function size(file) {
  const data = readFileSync(file);
  return TEXT.test(file) ? gzipSync(data, { level: 9 }).length : data.length;
}

function resolve(from, url) {
  if (/^(https?:)?\/\//.test(url) || url.startsWith('data:')) return null;
  const clean = url.split(/[?#]/)[0];
  const file = clean.startsWith('/') ? join(dist, clean) : join(dirname(from), clean);
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

/** Start tags only, attributes as a map; text and scripts are skipped. */
function tags(html) {
  const out = [];
  const re = /<(link|script|img|source)\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = {};
    const ar = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a;
    while ((a = ar.exec(m[2]))) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? '';
    out.push({ tag: m[1].toLowerCase(), attrs });
  }
  return out;
}

/** A JS file and everything it imports statically; dynamic imports are listed apart. */
function walkJs(file, seen, lazy) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(/(?:import|from)\s*["']([^"']+\.js)["']/g)) {
    const dep = resolve(file, m[1]);
    if (dep) walkJs(dep, seen, lazy);
  }
  for (const m of code.matchAll(/import\(\s*["']([^"']+\.js)["']\s*\)/g)) {
    const dep = resolve(file, m[1]);
    if (dep) lazy.add(dep);
  }
}

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return pages(path);
    return entry.name.endsWith('.html') ? [path] : [];
  });
}

let failed = false;
const rows = [];
for (const page of pages(dist)) {
  const html = readFileSync(page, 'utf8');
  const route =
    '/' +
    relative(dist, page)
      .replace(/index\.html$/, '')
      .replace(/\.html$/, '');
  const css = new Set();
  const media = new Set();
  const eagerJs = new Set();
  const lazy = new Set();
  for (const { tag, attrs } of tags(html)) {
    if (tag === 'link' && attrs.rel === 'stylesheet') css.add(resolve(page, attrs.href));
    if (tag === 'link' && attrs.rel === 'preload') {
      // Count the desktop variant of media specific preloads.
      if (!attrs.media || !attrs.media.includes('max-width')) media.add(resolve(page, attrs.href));
    }
    if (tag === 'script' && attrs.src) {
      const file = resolve(page, attrs.src);
      if (file) walkJs(file, eagerJs, lazy);
    }
    if (tag === 'img' && attrs.src && attrs.loading !== 'lazy') media.add(resolve(page, attrs.src));
  }
  // Astro inlines small page scripts as modules; follow their imports too.
  for (const m of html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)) {
    for (const i of m[1].matchAll(/(?:import|from)\s*["']([^"']+\.js)["']/g)) {
      const file = resolve(page, i[1]);
      if (file) walkJs(file, eagerJs, lazy);
    }
    for (const i of m[1].matchAll(/import\(\s*["']([^"']+\.js)["']\s*\)/g)) {
      const file = resolve(page, i[1]);
      if (file) lazy.add(file);
    }
  }
  const island = new Set();
  for (const file of lazy) walkJs(file, island, new Set());
  for (const file of eagerJs) island.delete(file);

  const sum = files => [...files].filter(Boolean).reduce((n, f) => n + size(f), 0);
  const htmlSize = gzipSync(html, { level: 9 }).length;
  const js = sum(eagerJs);
  const total = htmlSize + sum(css) + js + sum(media);
  const islandJs = sum(island);
  const assets = island.size ? sum(islandAssets()) : 0;
  rows.push({
    route,
    'html kB': kb(htmlSize),
    'css kB': kb(sum(css)),
    'first view JS kB': kb(js),
    'first view total kB': kb(total),
    '3D island JS kB': kb(islandJs),
    '3D island assets kB': kb(assets),
  });
  const over = [];
  if (kb(js) > BUDGET.firstViewJs) over.push(`first view JS ${kb(js)} > ${BUDGET.firstViewJs}`);
  if (kb(total) > BUDGET.firstViewTotal)
    over.push(`first view total ${kb(total)} > ${BUDGET.firstViewTotal}`);
  if (kb(islandJs) > BUDGET.islandJs)
    over.push(`3D island JS ${kb(islandJs)} > ${BUDGET.islandJs}`);
  if (kb(assets) > BUDGET.islandAssets)
    over.push(`3D island assets ${kb(assets)} > ${BUDGET.islandAssets}`);
  if (over.length) {
    failed = true;
    console.error(`${route}: over budget: ${over.join(', ')}`);
  }
}

console.table(rows);
console.log(`Budgets (kB): ${JSON.stringify(BUDGET)}. Text gzipped, images and fonts as served.`);
if (failed) process.exit(1);
