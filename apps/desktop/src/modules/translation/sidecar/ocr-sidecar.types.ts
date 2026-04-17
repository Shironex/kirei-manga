/**
 * Public types for the manga-OCR sidecar process manager. Kept separate from
 * the service so other modules (settings, translation gateway) can depend on
 * the status shape without pulling in the spawn / IPC machinery.
 */

/**
 * Lifecycle state surfaced by `OcrSidecarService.getStatus()`.
 *
 * - `not-downloaded`: the binary is missing from the user data dir; first
 *   `ensureReady()` call will fetch it from the GitHub Release asset.
 * - `downloading`: tarball is being streamed; `downloadProgress` is set.
 * - `starting`: child process spawned, waiting for the `{ready:true}` line.
 * - `ready`: spawned, model load may still be lazy (`modelLoaded`).
 * - `crashed`: last spawn exited unexpectedly; auto-restart is scheduled.
 * - `unhealthy`: 3 consecutive crashes — feature disabled until next manual
 *   `ensureReady()` (Slice K's Tesseract fallback kicks in here).
 */
export interface OcrSidecarStatus {
  state: 'not-downloaded' | 'downloading' | 'starting' | 'ready' | 'crashed' | 'unhealthy';
  reason?: string;
  modelLoaded?: boolean;
  downloadProgress?: { bytes: number; total: number };
}

/**
 * Per-bubble crop request sent to the sidecar's `ocr` op. Pixel coordinates
 * relative to the source image. Mirrors the `boxes[]` element of the Python
 * sidecar's JSON contract (see `sidecar/manga-ocr/main.py`).
 */
export interface OcrRequestBox {
  x: number;
  y: number;
  w: number;
  h: number;
}
