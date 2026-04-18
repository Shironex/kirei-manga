import type { OcrResult } from '@kireimanga/shared';
import type { OcrRequestBox } from './ocr-sidecar.types';

/**
 * Health snapshot for an OCR backend. The shape stays small on purpose — the
 * registry only needs `healthy` to pick, and the renderer only needs
 * `reason` to surface the disabled state in the K.3 settings UI.
 *
 * Distinct from `OcrSidecarStatus` (which carries the rich lifecycle state
 * for the sidecar's status panel): every backend collapses to this binary
 * answer when the orchestrator picks one for a request.
 */
export interface OcrBackendStatus {
  healthy: boolean;
  reason?: string;
}

/**
 * Common contract shared by every OCR backend (`OcrSidecarService` —
 * primary; `TesseractOcrService` — fallback). The orchestrator (Slice F.3 →
 * via `OcrBackendRegistry`) calls `getStatus()` to pick a backend, then
 * `ocr()` for the actual page.
 *
 * Per-backend specifics (sidecar lifecycle / Tesseract worker init) live on
 * the concrete classes; this interface is the OCR-only subset that matters
 * to the pipeline.
 */
export interface OcrBackend {
  ocr(imagePath: string, boxes: OcrRequestBox[]): Promise<OcrResult[]>;
  getStatus(): OcrBackendStatus;
}
