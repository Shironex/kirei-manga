import { Injectable } from '@nestjs/common';
import { createLogger } from '@kireimanga/shared';
import type { OcrBackend, OcrBackendStatus } from './ocr-backend.interface';
import { OcrSidecarService } from './ocr-sidecar.service';
import { TesseractOcrService } from './tesseract-ocr.service';

const logger = createLogger('OcrBackendRegistry');

/**
 * Adapt `OcrSidecarService`'s rich `OcrSidecarStatus` lifecycle shape to the
 * binary `OcrBackendStatus` the orchestrator picks against. `'ready'` is the
 * only state we hand a request to — every other state (downloading,
 * starting, crashed, unhealthy, not-downloaded) means we fall through to
 * the next candidate.
 *
 * The adapter is built up-front rather than via `implements OcrBackend` on
 * the sidecar class because the gateway still wants the rich status shape
 * (it surfaces `state` / `downloadProgress` to the renderer's status
 * panel) — keeping the two consumers separate avoids collapsing the
 * sidecar's status surface to satisfy the registry.
 */
function sidecarAsBackend(service: OcrSidecarService): OcrBackend {
  return {
    ocr: (imagePath, boxes) => service.ocr(imagePath, boxes),
    getStatus: (): OcrBackendStatus => {
      const s = service.getStatus();
      if (s.state === 'ready') return { healthy: true };
      return {
        healthy: false,
        reason: s.reason ?? `sidecar state=${s.state}`,
      };
    },
  };
}

/**
 * Picks the right OCR backend for the next pipeline call. Mirrors
 * `TranslationProviderRegistry` (E.3) in spirit — priority list, first
 * healthy wins, else throw.
 *
 * Today the candidate list is hard-coded `[sidecar, tesseract]`: sidecar
 * (manga-ocr) is the accuracy ceiling and gets first dibs, Tesseract is
 * the zero-config offline fallback. Future K-phase work might add a
 * user-selected override or per-series pin; that lands as a setting that
 * reorders the same array.
 */
@Injectable()
export class OcrBackendRegistry {
  private readonly sidecarBackend: OcrBackend;

  constructor(
    sidecar: OcrSidecarService,
    private readonly tesseract: TesseractOcrService,
  ) {
    this.sidecarBackend = sidecarAsBackend(sidecar);
  }

  /**
   * Pick the first healthy backend.
   *
   * @throws if every backend is unhealthy — the orchestrator surfaces this
   *   as a pipeline failure.
   */
  pickBackend(): OcrBackend {
    const candidates: OcrBackend[] = [this.sidecarBackend, this.tesseract];
    const reasons: string[] = [];
    for (const backend of candidates) {
      const status = backend.getStatus();
      if (status.healthy) {
        if (backend === this.tesseract && reasons.length > 0) {
          logger.info(
            `Sidecar unavailable (${reasons[0]}); falling back to Tesseract`,
          );
        }
        return backend;
      }
      reasons.push(status.reason ?? 'unhealthy');
    }
    throw new Error(
      'No healthy OCR backend (sidecar + tesseract both unavailable). ' +
        `sidecar: ${reasons[0]}; tesseract: ${reasons[1]}`,
    );
  }

  /**
   * Snapshot the Tesseract fallback's health for the gateway's
   * `provider-status` response (Slice K.3 UI). The sidecar's status is
   * already surfaced separately under `pipeline.ocrSidecar` in its own
   * rich shape.
   */
  getFallbackStatus(): { name: 'tesseract'; healthy: boolean; reason?: string } {
    const status = this.tesseract.getStatus();
    return { name: 'tesseract', healthy: status.healthy, reason: status.reason };
  }
}
