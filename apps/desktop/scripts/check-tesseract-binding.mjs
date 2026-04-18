/**
 * Slice K.1 smoke check — verify `tesseract.js` loads cleanly.
 *
 * No actual OCR is exercised here — that lands in K.2 with the
 * TesseractOcrProvider. This is a contract check that:
 *
 *   1. The dependency is installed (`pnpm install` ran).
 *   2. The module's main export resolves and exposes the `createWorker`
 *      factory we'll use in K.2.
 *
 * Runs as a one-shot Node script so CI can `node apps/desktop/scripts/...`
 * without spinning up Jest. Mirrors the logging style of
 * `scripts/build-sidecar.mjs` and `scripts/fetch-tesseract-traineddata.mjs`.
 */

import process from 'node:process';

console.log('==> Loading tesseract.js');

let tesseract;
try {
  tesseract = await import('tesseract.js');
} catch (err) {
  console.error(
    [
      `✗ Failed to import tesseract.js: ${err?.message ?? err}`,
      '  Did `pnpm install` run? The dep lives in apps/desktop/package.json.',
    ].join('\n')
  );
  process.exit(1);
}

const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;

if (typeof createWorker !== 'function') {
  console.error(
    [
      '✗ tesseract.js loaded but does not expose `createWorker`.',
      '  Slice K.2 needs this entry point — bail out before the regression hits prod.',
    ].join('\n')
  );
  process.exit(1);
}

console.log('✓ tesseract.js imports cleanly and exposes createWorker');
