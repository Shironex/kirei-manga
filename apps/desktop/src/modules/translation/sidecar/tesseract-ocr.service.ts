import { Injectable } from '@nestjs/common';
import * as fsSync from 'fs';
import * as path from 'path';
import { createWorker, type Worker } from 'tesseract.js';
import { createLogger, type OcrResult } from '@kireimanga/shared';
import type { OcrBackend, OcrBackendStatus } from './ocr-backend.interface';
import type { OcrRequestBox } from './ocr-sidecar.types';

const logger = createLogger('TesseractOcrService');

/**
 * Tesseract language pack identifiers — must match `<lang>.traineddata` files
 * present in `langPath`. The `+` syntax loads multiple traineddata into one
 * worker; for Japanese we keep both orientations warm because manga mixes
 * yokogaki + tategaki. Order matters: tesseract honours the listed sequence
 * when assembling its character set.
 */
type TesseractLang = 'jpn+jpn_vert' | 'eng' | 'kor+kor_vert' | 'chi_sim' | 'chi_tra';

/**
 * BCP-47 → Tesseract lang routing. Manga-OCR is Japanese-only, so any
 * non-`'ja'` source falls through to Tesseract — `sourceLang` here is
 * whatever the orchestrator forwards from settings / per-page payload.
 *
 * Korean / Chinese entries are best-effort: the bundled `extraResources`
 * filter only ships `jpn*` + `eng` traineddata today (see
 * `apps/desktop/resources/tesseract/`). Selecting one of the unbundled
 * codes flips `getStatus().healthy` to false so the user sees a clear
 * "traineddata not found" reason rather than tesseract.js trying to
 * download it from upstream.
 */
const LANG_BY_BCP47: Record<string, TesseractLang> = {
  ja: 'jpn+jpn_vert',
  jp: 'jpn+jpn_vert',
  jpn: 'jpn+jpn_vert',
  en: 'eng',
  eng: 'eng',
  ko: 'kor+kor_vert',
  kor: 'kor+kor_vert',
  zh: 'chi_sim',
  'zh-cn': 'chi_sim',
  'zh-hans': 'chi_sim',
  'zh-tw': 'chi_tra',
  'zh-hant': 'chi_tra',
};

const FALLBACK_LANG: TesseractLang = 'eng';

function resolveTesseractLang(sourceLang: string | undefined): TesseractLang {
  const key = (sourceLang ?? 'ja').toLowerCase();
  const mapped = LANG_BY_BCP47[key];
  if (mapped) return mapped;
  logger.warn(
    `unmapped sourceLang "${sourceLang}" — falling back to ${FALLBACK_LANG}`,
  );
  return FALLBACK_LANG;
}

/**
 * Required traineddata files keyed by Tesseract lang. The presence check
 * below is the hard gate for `getStatus().healthy`: if any are missing, the
 * bundled worker init would download them from upstream — the exact runtime
 * network call we avoid by shipping `_fast` traineddata locally.
 *
 * The status reflects only the **default** Japanese pair so the K.3 settings
 * UI shows a stable health pill regardless of which sourceLang the user
 * picks. Worker init for an unbundled lang fails at use-time with a clear
 * "traineddata not found" reason via the workerInitError path.
 */
const REQUIRED_TRAINEDDATA = ['jpn.traineddata', 'jpn_vert.traineddata'] as const;

/** Files that must be on disk for a given Tesseract lang to spin up a worker. */
function trainedDataFilesFor(lang: TesseractLang): string[] {
  return lang.split('+').map(part => `${part}.traineddata`);
}

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
  /**
   * Per-lang worker cache. The first OCR call for a given Tesseract lang
   * pays the ~1-2s init cost; subsequent calls for the same lang reuse the
   * warm worker. Mid-session lang switches keep the previous worker alive
   * (so flipping back is free) — process exit reclaims the WASM modules.
   */
  private readonly workers = new Map<TesseractLang, Worker>();
  private readonly workerInitPromises = new Map<TesseractLang, Promise<Worker>>();
  private workerInitError: string | undefined;

  constructor() {
    this.langPath = resolveLangPath();
  }

  /**
   * Pick a backend? Healthy iff the default Japanese traineddata pair exists
   * on disk and the most recent worker init didn't fail. The presence check
   * is synchronous + cached on every call, but `existsSync` against two
   * small filenames is fast enough not to bother memoising.
   *
   * The status only checks the default Japanese pack: an unbundled
   * sourceLang (Korean/Chinese) surfaces its missing traineddata at use-time
   * via the workerInitError path so the K.3 status pill stays stable for
   * the dominant case.
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
   * OCR every box in turn against the worker matching `sourceLang`.
   * Per-box failures encapsulate: one box throwing surfaces as `text: ''`
   * (matches the sidecar's contract — the orchestrator detects empty
   * originals and skips the translate batch entry) so a single corrupted
   * bubble doesn't poison the whole page.
   *
   * Boxes are processed sequentially: tesseract.js owns a single WASM
   * module + worker thread per language, so concurrent `recognize()` calls
   * just queue inside the worker anyway — parallel scheduling is wasted
   * task switching, not wall-clock speedup.
   */
  async ocr(
    imagePath: string,
    boxes: OcrRequestBox[],
    sourceLang?: string,
  ): Promise<OcrResult[]> {
    const lang = resolveTesseractLang(sourceLang);
    const worker = await this.ensureWorker(lang);
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

  /** Test seam — terminate every cached worker so re-init can be exercised. */
  async terminate(): Promise<void> {
    const workers = Array.from(this.workers.values());
    this.workers.clear();
    this.workerInitPromises.clear();
    await Promise.all(
      workers.map(async w => {
        try {
          await w.terminate();
        } catch (err) {
          logger.warn(`tesseract worker terminate failed: ${(err as Error).message}`);
        }
      }),
    );
  }

  /**
   * Lazy worker init keyed by Tesseract lang. Concurrent first calls for the
   * same lang share an in-flight init promise so we never spawn two workers
   * for one lang — both would compete for the same WASM module load and one
   * would silently win. Different langs get their own slot in the cache.
   */
  private ensureWorker(lang: TesseractLang): Promise<Worker> {
    const existing = this.workers.get(lang);
    if (existing) return Promise.resolve(existing);
    const inflight = this.workerInitPromises.get(lang);
    if (inflight) return inflight;

    // Pre-flight the traineddata files for this specific lang so an
    // unbundled lang fails fast with a useful path rather than tesseract.js
    // attempting to fetch from upstream and ENOENT'ing on the .gz suffix.
    const required = trainedDataFilesFor(lang);
    const missing = required.filter(
      f => !fsSync.existsSync(path.join(this.langPath, f)),
    );
    if (missing.length > 0) {
      this.workerInitError = `traineddata not found for "${lang}" at ${this.langPath} (missing: ${missing.join(', ')})`;
      logger.warn(this.workerInitError);
      return Promise.reject(new Error(this.workerInitError));
    }

    const promise = (async () => {
      try {
        logger.info(
          `Initializing Tesseract worker (langs=${lang}, langPath=${this.langPath})`,
        );
        const worker = await createWorker(lang, 1, {
          langPath: this.langPath,
          // We ship uncompressed `.traineddata` under `resources/tesseract/`.
          // tesseract.js v7 defaults to gzip-on-disk and would otherwise look
          // for `<lang>.traineddata.gz` and crash the worker with ENOENT.
          // Keep the bundle uncompressed for byte alignment with the upstream
          // Slice K.1 fetch script and turn the gzip expectation off here.
          gzip: false,
        });
        this.workers.set(lang, worker);
        this.workerInitError = undefined;
        return worker;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.workerInitError = `tesseract worker init failed: ${message}`;
        // Drop the cached promise so a future call can retry — the failure
        // is sticky in `getStatus()` until then, which is what the
        // settings UI wants to display.
        this.workerInitPromises.delete(lang);
        logger.warn(this.workerInitError);
        throw new Error(this.workerInitError);
      }
    })();
    this.workerInitPromises.set(lang, promise);
    return promise;
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
