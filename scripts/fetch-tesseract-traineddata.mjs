/**
 * Fetch the bundled Tesseract Japanese traineddata files.
 *
 * Usage:
 *   node scripts/fetch-tesseract-traineddata.mjs            # download missing only
 *   node scripts/fetch-tesseract-traineddata.mjs --force    # re-download even if present
 *   node scripts/fetch-tesseract-traineddata.mjs --help
 *
 * Slice K.1 ships Tesseract as the OCR fallback when the manga-ocr Python
 * sidecar (Slice D) is unavailable (download not completed, crashed, or
 * user opted out). The fast variant (`tessdata_fast`) trades a small
 * accuracy hit for ~5MB total — worth it for a zero-config offline
 * fallback bundled into the installer.
 *
 * The traineddata blobs are .gitignored — CI and local dev fetch them
 * here before electron-builder packs them into `extraResources`. Keeps
 * the git history free of multi-megabyte binaries.
 *
 * Mirrors the logging / error-handling style of `scripts/fetch-prebuilds.mjs`
 * and `scripts/build-sidecar.mjs`. Uses the global `fetch` (Node 22+)
 * instead of node:https to keep the script short.
 */

import { mkdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const targetDir = resolve(repoRoot, 'apps', 'desktop', 'resources', 'tesseract');

// Pinned to the `main` branch of tessdata_fast. The repo uses a single
// long-lived branch (Apache 2.0, upstream by Google) — no tagged
// releases — so `main` is the correct ref. `expectedBytes` is recorded
// from upstream HEAD at the time this script lands; a non-matching size
// means upstream changed and we should re-record + bump the script.
const FILES = [
  {
    name: 'jpn.traineddata',
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/jpn.traineddata',
    expectedBytes: 2_471_260,
  },
  {
    name: 'jpn_vert.traineddata',
    url: 'https://github.com/tesseract-ocr/tessdata_fast/raw/main/jpn_vert.traineddata',
    expectedBytes: 3_037_480,
  },
];

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const force = argv.includes('--force');

if (!existsSync(targetDir)) {
  mkdirSync(targetDir, { recursive: true });
}

let fetched = 0;
let skipped = 0;

for (const file of FILES) {
  const dest = join(targetDir, file.name);
  if (!force && existsSync(dest)) {
    const actual = statSync(dest).size;
    if (actual === file.expectedBytes) {
      console.log(`==> ${file.name} already present (${formatMB(actual)}) — skipping`);
      skipped += 1;
      continue;
    }
    console.warn(
      `  ${file.name} present but size mismatch (${actual} bytes, expected ${file.expectedBytes}) — re-downloading`
    );
  }

  await downloadTo(file, dest);
  fetched += 1;
}

console.log(`✓ Done — ${fetched} downloaded, ${skipped} already present in ${targetDir}`);

function printUsage() {
  console.log(
    [
      'Usage: node scripts/fetch-tesseract-traineddata.mjs [options]',
      '',
      'Downloads Tesseract Japanese traineddata (jpn + jpn_vert) from',
      'tessdata_fast (Apache 2.0) into apps/desktop/resources/tesseract/.',
      'electron-builder packs them into the installer at build time.',
      '',
      'Options:',
      '  --force       Re-download even if files are present at expected size.',
      '  -h, --help    Show this message.',
      '',
      'Files:',
      ...FILES.map(f => `  - ${f.name} (${formatMB(f.expectedBytes)})`),
    ].join('\n')
  );
}

async function downloadTo(file, dest) {
  console.log(`==> Fetching ${file.name} from ${file.url}`);

  let response;
  try {
    response = await fetch(file.url, { redirect: 'follow' });
  } catch (err) {
    console.error(`✗ Network error fetching ${file.name}: ${err?.message ?? err}`);
    process.exit(1);
  }

  if (!response.ok) {
    console.error(`✗ Failed to fetch ${file.name}: HTTP ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const buf = Buffer.from(await response.arrayBuffer());

  if (buf.length !== file.expectedBytes) {
    console.error(
      [
        `✗ Size mismatch for ${file.name}:`,
        `  expected ${file.expectedBytes} bytes, got ${buf.length}.`,
        '  Upstream tessdata_fast may have been updated. Verify the new file,',
        '  then update `expectedBytes` in scripts/fetch-tesseract-traineddata.mjs.',
      ].join('\n')
    );
    process.exit(1);
  }

  writeFileSync(dest, buf);
  console.log(`✓ Wrote ${file.name} (${formatMB(buf.length)}) → ${dest}`);
}

function formatMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
