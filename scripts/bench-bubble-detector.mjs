/**
 * Fixture-page benchmark for the bubble-detector native addon (v0.3 Slice C.4).
 *
 * Runs `@kireimanga/bubble-detector#detectBubbles` over every page image in a
 * fixture folder, compares the detections against a sibling
 * `<page>.json` of human-labeled boxes, and reports recall / precision /
 * mean IoU plus detection-time percentiles. The script is the empirical
 * tuning surface — the screentone constants from C.1 and the aspect range
 * from C.2 can be revisited based on its output.
 *
 * Constraint: works without a built native addon. On a contributor's machine
 * without OpenCV/prebuilds, prints a clear "no addon" message and exits 1.
 * We do NOT mock the addon — this is a real-world quality measurement.
 *
 * Fixture format (per-page sibling files; easier to add/diff one at a time):
 *
 *   <fixture-folder>/
 *     vol01-p042.jpg
 *     vol01-p042.json     # { "boxes": [{ "x": 100, "y": 200, "w": 300, "h": 150 }, ...] }
 *
 * IoU threshold for "match" defaults to 0.5 (the standard CV literature
 * default) and is overridable via --iou.
 *
 * Mirrors the logging + error-handling style of `scripts/native-build.mjs`
 * and `scripts/fetch-prebuilds.mjs`.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const DEFAULT_FIXTURES_REL = 'native/bubble-detector/test/fixtures/pages';
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const TARGET_RECALL = 0.9;
const TARGET_PRECISION = 0.95;

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const options = parseArgs(argv);

const fixturesDir = resolve(repoRoot, options.fixtures ?? DEFAULT_FIXTURES_REL);
const fixturesRel = relative(repoRoot, fixturesDir) || '.';

if (!Number.isFinite(options.iou) || options.iou <= 0 || options.iou > 1) {
  console.error(`✗ --iou must be a number in (0, 1]; got ${options.iouRaw}`);
  process.exit(1);
}

if (options.direction !== 'rtl' && options.direction !== 'ltr') {
  console.error(`✗ --direction must be 'rtl' or 'ltr'; got ${options.directionRaw}`);
  process.exit(1);
}

if (!(await isExistingDir(fixturesDir))) {
  console.error(
    [
      `✗ Fixtures directory not found: ${fixturesDir}`,
      '  Create it or pass --fixtures <dir>.',
      `  See ${DEFAULT_FIXTURES_REL}/README.md for the expected layout.`,
    ].join('\n')
  );
  process.exit(1);
}

// Discover fixtures before loading the addon so contributors who haven't
// built it yet still get a useful "no fixtures" message instead of being
// stopped by the addon loader.
const pageImages = await collectPageImages(fixturesDir);
if (pageImages.length === 0) {
  console.error(
    [
      `✗ No fixture pages found in ${fixturesDir}`,
      `  Expected page images (${[...IMAGE_EXTS].join(', ')}) with sibling <page>.json labels.`,
      `  See ${DEFAULT_FIXTURES_REL}/README.md for details.`,
    ].join('\n')
  );
  process.exit(1);
}

const addon = await loadAddon();

const pageResults = [];

for (const imagePath of pageImages) {
  const labelPath = labelPathFor(imagePath);
  const relImage = relative(fixturesDir, imagePath);

  let labels;
  try {
    labels = await readLabels(labelPath);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn(
        `  skip ${relImage} — no sibling label file (${relative(fixturesDir, labelPath)})`
      );
      continue;
    }
    // Malformed JSON or schema violation → fail the run so contributors
    // notice immediately rather than silently dropping bad fixtures.
    console.error(`✗ ${relImage}: ${err.message}`);
    process.exit(1);
  }

  const t0 = performance.now();
  let detected;
  try {
    detected = await addon.detectBubbles(imagePath, {
      direction: options.direction,
    });
  } catch (err) {
    console.error(`✗ ${relImage}: detector threw — ${err.message ?? String(err)}`);
    process.exit(1);
  }
  const durationMs = performance.now() - t0;

  const detectedBoxes = detected.map(toBox);
  const matches = matchByIou(detectedBoxes, labels, options.iou);
  const tp = matches.length;
  const fp = detectedBoxes.length - tp;
  const fn = labels.length - tp;
  const meanIou =
    matches.length === 0 ? 0 : matches.reduce((sum, m) => sum + m.iou, 0) / matches.length;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);

  pageResults.push({
    image: relImage,
    detected: detectedBoxes.length,
    labeled: labels.length,
    matched: tp,
    tp,
    fp,
    fn,
    precision,
    recall,
    mean_iou: meanIou,
    duration_ms: durationMs,
  });
}

if (pageResults.length === 0) {
  console.error(
    `✗ Found ${pageImages.length} image(s) but none had a matching label JSON. Nothing to benchmark.`
  );
  process.exit(1);
}

const aggregate = aggregateResults(pageResults);

if (options.json) {
  const payload = {
    fixtures: fixturesRel,
    iou_threshold: options.iou,
    direction: options.direction,
    pages: pageResults,
    aggregate,
    targets: { recall: TARGET_RECALL, precision: TARGET_PRECISION },
  };
  console.log(JSON.stringify(payload, null, 2));
} else {
  printTextReport({
    fixturesRel,
    iouThreshold: options.iou,
    direction: options.direction,
    verbose: options.verbose,
    pages: pageResults,
    aggregate,
  });
}

// TODO(slice-C followup): add `--enforce-targets` flag that exits 2 when
// aggregate recall/precision fall below TARGET_RECALL/TARGET_PRECISION.
// Today the targets are reported, not enforced — the bench is a tuning
// surface, not a CI gate.
process.exit(0);

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------

function parseArgs(args) {
  const out = {
    fixtures: undefined,
    iou: 0.5,
    iouRaw: '0.5',
    direction: 'rtl',
    directionRaw: 'rtl',
    json: false,
    verbose: false,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--fixtures':
        out.fixtures = args[++i];
        break;
      case '--iou':
        out.iouRaw = args[++i];
        out.iou = Number(out.iouRaw);
        break;
      case '--direction':
        out.directionRaw = args[++i];
        out.direction = out.directionRaw;
        break;
      case '--json':
        out.json = true;
        break;
      case '--verbose':
        out.verbose = true;
        break;
      default:
        console.error(`✗ Unknown argument: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }
  return out;
}

function printUsage() {
  console.log(
    [
      'Usage: pnpm bench-bubble-detector [options]',
      '',
      'Runs the bubble detector over a folder of manga pages, compares results',
      'to human-labeled JSON, and reports recall / precision / IoU.',
      '',
      'Options:',
      '  --fixtures <dir>       Path to fixture folder',
      `                         (default: ${DEFAULT_FIXTURES_REL})`,
      '  --iou <number>         IoU threshold for true-positive match (default: 0.5)',
      '  --direction <rtl|ltr>  Reading direction passed to detector (default: rtl)',
      '  --json                 Emit JSON to stdout instead of human-readable text',
      '  --verbose              Print per-page results in text mode',
      '  -h, --help             Show this help',
      '',
      'Fixture layout — sibling files per page:',
      '  pages/',
      '    vol01-p042.jpg',
      '    vol01-p042.json   { "boxes": [{ "x": …, "y": …, "w": …, "h": … }, …] }',
      '',
      'Populating the fixture folder is a manual, copyright-sensitive task that',
      `lives outside this script. See ${DEFAULT_FIXTURES_REL}/README.md.`,
      '',
      'Exit codes:',
      '  0  benchmark ran on at least one page',
      '  1  no addon, no fixtures, no labels, malformed JSON, or detector error',
      '  2  reserved for future --enforce-targets mode',
    ].join('\n')
  );
}

// ---------------------------------------------------------------------------
// Addon loader
// ---------------------------------------------------------------------------

async function loadAddon() {
  try {
    const mod = await import('@kireimanga/bubble-detector');
    const candidate = mod.default ?? mod;
    if (typeof candidate.detectBubbles !== 'function') {
      throw new Error('addon loaded but detectBubbles() is missing — incompatible build?');
    }
    return candidate;
  } catch (err) {
    const detail = err?.message ? `\n  ${err.message}` : '';
    console.error(
      [
        '✗ bubble-detector addon failed to load.',
        '  Run `pnpm fetch-prebuilds` to pull a CI prebuild,',
        '  or build OpenCV locally:',
        '    pnpm --filter @kireimanga/bubble-detector run build:opencv:posix',
        '    (or `:win` on Windows)',
        '  then `pnpm native:build`.' + detail,
      ].join('\n')
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Fixture discovery + label parsing
// ---------------------------------------------------------------------------

async function collectPageImages(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (IMAGE_EXTS.has(extname(entry.name).toLowerCase())) {
      out.push(join(dir, entry.name));
    }
  }
  out.sort();
  return out;
}

function labelPathFor(imagePath) {
  const ext = extname(imagePath);
  return imagePath.slice(0, imagePath.length - ext.length) + '.json';
}

async function readLabels(labelPath) {
  const raw = await readFile(labelPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`malformed label JSON at ${labelPath}: ${err.message}`, {
      cause: err,
    });
  }
  if (!parsed || !Array.isArray(parsed.boxes)) {
    throw new Error(`label JSON at ${labelPath} is missing required \`boxes\` array`);
  }
  return parsed.boxes.map((box, idx) => {
    const validated = toValidatedBox(box);
    if (!validated) {
      throw new Error(`label JSON at ${labelPath} box[${idx}] missing finite x/y/w/h`);
    }
    return validated;
  });
}

function toValidatedBox(b) {
  if (!b || typeof b !== 'object') return null;
  const { x, y, w, h } = b;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return null;
  }
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function toBox(b) {
  return { x: b.x, y: b.y, w: b.w, h: b.h };
}

// ---------------------------------------------------------------------------
// IoU + greedy bipartite matcher
// ---------------------------------------------------------------------------

function iou(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const intersection = (x2 - x1) * (y2 - y1);
  const union = a.w * a.h + b.w * b.h - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function matchByIou(detected, labeled, threshold) {
  const matches = [];
  const usedDetected = new Set();
  const usedLabeled = new Set();
  const pairs = [];
  for (let i = 0; i < detected.length; i++) {
    for (let j = 0; j < labeled.length; j++) {
      const score = iou(detected[i], labeled[j]);
      if (score >= threshold) pairs.push([i, j, score]);
    }
  }
  pairs.sort((a, b) => b[2] - a[2]);
  for (const [i, j, score] of pairs) {
    if (usedDetected.has(i) || usedLabeled.has(j)) continue;
    usedDetected.add(i);
    usedLabeled.add(j);
    matches.push({ detIdx: i, labIdx: j, iou: score });
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Aggregation + reporting
// ---------------------------------------------------------------------------

function aggregateResults(pages) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let iouSum = 0;
  let iouCount = 0;
  const durations = [];

  for (const page of pages) {
    tp += page.tp;
    fp += page.fp;
    fn += page.fn;
    if (page.matched > 0) {
      iouSum += page.mean_iou * page.matched;
      iouCount += page.matched;
    }
    durations.push(page.duration_ms);
  }

  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const meanIou = iouCount === 0 ? 0 : iouSum / iouCount;

  durations.sort((a, b) => a - b);
  const p50 = percentile(durations, 0.5);
  const p95 = percentile(durations, 0.95);
  const max = durations.length ? durations[durations.length - 1] : 0;
  const mean =
    durations.length === 0 ? 0 : durations.reduce((sum, d) => sum + d, 0) / durations.length;

  return {
    pages: pages.length,
    tp,
    fp,
    fn,
    precision,
    recall,
    mean_iou: meanIou,
    duration_ms: { mean, p50, p95, max },
  };
}

function percentile(sortedAsc, q) {
  if (sortedAsc.length === 0) return 0;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = q * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] * (1 - frac) + sortedAsc[hi] * frac;
}

function printTextReport({ fixturesRel, iouThreshold, direction, verbose, pages, aggregate }) {
  console.log('KireiManga bubble-detector benchmark');
  console.log(`Fixtures: ${fixturesRel}/  (${pages.length} page${pages.length === 1 ? '' : 's'})`);
  console.log(`Direction: ${direction}   IoU threshold: ${iouThreshold}`);
  console.log('');

  const shown = verbose ? pages : pages.slice(0, 0);
  if (verbose) {
    console.log('Per-page:');
  } else {
    console.log('Per-page (use --verbose to see all):');
  }
  for (const page of shown) {
    const ok = page.recall >= TARGET_RECALL && page.precision >= TARGET_PRECISION;
    const mark = ok ? '✓' : '✗';
    console.log(
      `  ${mark} ${page.image.padEnd(28)} ` +
        `P=${fmt(page.precision)}  R=${fmt(page.recall)}  IoU=${fmt(page.mean_iou)}   ` +
        `${page.detected} detected, ${page.matched} matched, ${page.labeled} labeled    ` +
        `${Math.round(page.duration_ms)} ms`
    );
  }
  if (verbose) console.log('');

  console.log('Aggregate');
  console.log(
    `  Precision   ${fmt(aggregate.precision)}   (${aggregate.tp} tp, ${aggregate.fp} fp)`
  );
  console.log(`  Recall      ${fmt(aggregate.recall)}   (${aggregate.tp} tp, ${aggregate.fn} fn)`);
  console.log(`  Mean IoU    ${fmt(aggregate.mean_iou)}`);
  console.log(
    `  Detection   p50 ${Math.round(aggregate.duration_ms.p50)}ms   ` +
      `p95 ${Math.round(aggregate.duration_ms.p95)}ms   ` +
      `max ${Math.round(aggregate.duration_ms.max)}ms`
  );
  console.log('');
  console.log('Targets (Slice C ship-quality):');
  console.log(
    `  Recall    ≥ ${TARGET_RECALL.toFixed(2)}  ${aggregate.recall >= TARGET_RECALL ? '✓' : '✗'}`
  );
  console.log(
    `  Precision ≥ ${TARGET_PRECISION.toFixed(2)}  ${aggregate.precision >= TARGET_PRECISION ? '✓' : '✗'}`
  );
}

function fmt(n) {
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// fs helpers
// ---------------------------------------------------------------------------

async function isExistingDir(p) {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}
