import { Injectable } from '@nestjs/common';
import * as fsSync from 'fs';
import * as path from 'path';
import { createWorker, type Worker } from 'tesseract.js';
import { createLogger, type OcrResult } from '@kireimanga/shared';
import type { OcrBackend, OcrBackendStatus } from './ocr-backend.interface';
import type { OcrRequestBox } from './ocr-sidecar.types';

const logger = createLogger('TesseractOcrService');

/**
 * Languages loaded into the worker. `jpn` covers horizontal text (yokogaki);
 * `jpn_vert` covers vertical text (tategaki) — most manga speech bubbles. We
 * keep both warm so a single worker handles either orientation; per-box PSM
 * tuning happens in the call options if/when it becomes worth it.
 */
const TESSERACT_LANGS = 'jpn+jpn_vert';

/**
 * Required traineddata files in `langPath`. The presence check below is the
 * hard gate for `getStatus().healthy`: if either is missing, the bundled
 * worker init would download them from upstream — which is the exact runtime
 * network call we are avoiding by shipping `_fast` traineddata locally.
 */
const REQUIRED_TRAINEDDATA = ['jpn.traineddata', 'jpn_vert.traineddata'] as const;

/**
 * Resolve the directory containing the bundled `*.traineddata` files. Two
 * environments matter:
 *
 * - **Production** (packaged Electron app): traineddata sits under
 *   `process.resourcesPath/tesseract/` (electron-builder `extraResources`
 *   entry, see `electron-builder.json`).
 * - **Development** (`pnpm dev` / Jest): traineddata sits under
 *   `apps/desktop/resources/tesseract/`. The desktop bundle is emitted to
 *   `apps/desktop/dist/main/index.js` by esbuild, so `__dirname` at runtime
 *   is `apps/desktop/dist/main`. Going up two levels lands at
 *   `apps/desktop/`, then descending into `resources/tesseract/` reaches the
 *   files. Jest runs the .ts source directly via `ts-jest`, so `__dirname`
 *   is `apps/desktop/src/modules/translation/sidecar/` — five `..` segments
 *   land at `apps/desktop/`. We resolve both candidates and pick whichever
 *   exists on disk so the same binary works in both modes.
 *
 * `process.resourcesPath` is undefined outside Electron (Jest, plain Node);
 * we tolerate that by falling through to the dev candidates rather than
 * throwing at module load.
 */
function resolveLangPath(): string {
  const candidates: string[] = [];
  const resourcesPath = (process as { resourcesPath?: string }).resourcesPath;
  if (typeof resourcesPath === 'string' && resourcesPath.length > 0) {
    candidates.push(path.join(resourcesPath, 'tesseract'));
  }
  // Bundled-build dev path: dist/main/index.js → ../../resources/tesseract.
  candidates.push(path.resolve(__dirname, '..', '..', 'resources', 'tesseract'));
  // Source-tree dev path (Jest, ts-node): src/modules/translation/sidecar →
  // ../../../../resources/tesseract.
  candidates.push(
    path.resolve(__dirname, '..', '..', '..', '..', 'resources', 'tesseract'),
  );

  for (const dir of candidates) {
    if (fsSync.existsSync(dir)) return dir;
  }
  // Last-resort: return the first candidate so the missing-files reason in
  // `getStatus()` points at a stable path rather than `undefined`.
  return candidates[0];
}

/**
 * Tesseract.js-backed OCR fallback. Used by the orchestrator when the
 * primary `OcrSidecarService` (manga-ocr Python) is unhealthy — download
 * incomplete, repeated crashes, or the user opted out.
 *
 * Lazy-init: the worker isn't spun up at module-init time. Worker startup
 * costs ~1-2s (loading both jpn + jpn_vert traineddata into the WASM core)
 * and would block boot for users who never trigger the fallback. The first
 * `ocr()` call pays that cost; subsequent calls reuse the warm worker.
 *
 * Per-box cropping uses `tesseract.js`'s built-in `recognize(imagePath, {
 * rectangle })` — Tesseract handles the crop natively in WASM, so we never
 * need a Node-side image-processing dep just to slice bubble regions.
 */
@Injectable()
export class TesseractOcrService implements OcrBackend {
  private readonly langPath: string;
  private worker: Worker | null = null;
  private workerInitPromise: Promise<Worker> | null = null;
  private workerInitError: string | undefined;

  constructor() {
    this.langPath = resolveLangPath();
  }

  /**
   * Pick a backend? Healthy iff both traineddata files exist on disk and the
   * lazy worker init didn't already fail. The presence check is synchronous
   * + cached on every call, but `existsSync` against two small filenames is
   * fast enough not to bother memoising.
   */
  getStatus(): OcrBackendStatus {
    const missing = REQUIRED_TRAINEDDATA.filter(
      f => !fsSync.existsSync(path.join(this.langPath, f)),
    );
    if (missing.length > 0) {
      return {
        healthy: false,
        reason:
          `traineddata not found at ${this.langPath} — ` +
          'run `pnpm fetch-tesseract` (dev) or reinstall the app',
      };
    }
    if (this.workerInitError) {
      return { healthy: false, reason: this.workerInitError };
    }
    return { healthy: true };
  }

  /**
   * OCR every box in turn. Per-box failures encapsulate: one box throwing
   * surfaces as `text: ''` (matches the sidecar's contract — the
   * orchestrator detects empty originals and skips the translate batch
   * entry) so a single corrupted bubble doesn't poison the whole page.
   *
   * Boxes are processed sequentially, not in parallel: tesseract.js owns a
   * single WASM module + worker thread, so concurrent `recognize()` calls
   * just queue inside the worker anyway — the cost of starting them in
   * parallel is wasted task scheduling, not wall-clock speedup.
   */
  async ocr(imagePath: string, boxes: OcrRequestBox[]): Promise<OcrResult[]> {
    const worker = await this.ensureWorker();
    const results: OcrResult[] = [];
    for (let boxIndex = 0; boxIndex < boxes.length; boxIndex++) {
      const box = boxes[boxIndex];
      try {
        const { data } = await worker.recognize(imagePath, {
          rectangle: { left: box.x, top: box.y, width: box.w, height: box.h },
        });
        const text = (data.text ?? '').trim();
        const confidence = aggregateConfidence(data);
        results.push({ boxIndex, text, confidence });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          `Tesseract OCR failed for box ${boxIndex} of ${imagePath}: ${message}`,
        );
        results.push({ boxIndex, text: '' });
      }
    }
    return results;
  }

  /** Test seam — clear the cached worker so re-init can be exercised. */
  async terminate(): Promise<void> {
    if (this.worker) {
      const w = this.worker;
      this.worker = null;
      this.workerInitPromise = null;
      try {
        await w.terminate();
      } catch (err) {
        logger.warn(`tesseract worker terminate failed: ${(err as Error).message}`);
      }
    }
  }

  /**
   * Lazy worker init. Concurrent first calls share the same in-flight
   * `workerInitPromise` so we never spawn two workers — both would compete
   * for the same WASM module load and one would silently win.
   */
  private ensureWorker(): Promise<Worker> {
    if (this.worker) return Promise.resolve(this.worker);
    if (this.workerInitPromise) return this.workerInitPromise;

    this.workerInitPromise = (async () => {
      try {
        logger.info(
          `Initializing Tesseract worker (langs=${TESSERACT_LANGS}, langPath=${this.langPath})`,
        );
        const worker = await createWorker(TESSERACT_LANGS, 1, {
          langPath: this.langPath,
        });
        this.worker = worker;
        this.workerInitError = undefined;
        return worker;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.workerInitError = `tesseract worker init failed: ${message}`;
        // Drop the cached promise so a future call can retry — the failure
        // is sticky in `getStatus()` until then, which is what the
        // settings UI wants to display.
        this.workerInitPromise = null;
        logger.warn(this.workerInitError);
        throw new Error(this.workerInitError);
      }
    })();

    return this.workerInitPromise;
  }
}

/**
 * Aggregate per-word confidences into a single mean for one OCR call.
 * Tesseract reports confidences as 0-100 floats per Word; we mean them
 * across every word in every line of every block. Empty pages collapse to
 * `undefined` rather than `0` so downstream callers can distinguish "no
 * text recognised" from "very-low-confidence text".
 */
function aggregateConfidence(data: {
  blocks?: Array<{ paragraphs?: Array<{ lines?: Array<{ words?: Array<{ confidence?: number }> }> }> }> | null;
  confidence?: number;
}): number | undefined {
  const confidences: number[] = [];
  for (const block of data.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const line of para.lines ?? []) {
        for (const word of line.words ?? []) {
          if (typeof word.confidence === 'number') confidences.push(word.confidence);
        }
      }
    }
  }
  if (confidences.length === 0) {
    // Fall back to the page-level confidence Tesseract emits when present —
    // some short bubbles only carry the top-level number with no word
    // breakdown.
    return typeof data.confidence === 'number' ? data.confidence : undefined;
  }
  const sum = confidences.reduce((acc, c) => acc + c, 0);
  return sum / confidences.length;
}
