import { OcrBackendRegistry } from './ocr-backend-registry';
import type { OcrSidecarService } from './ocr-sidecar.service';
import type { OcrSidecarStatus } from './ocr-sidecar.types';
import type { TesseractOcrService } from './tesseract-ocr.service';

/**
 * Build a registry against fake sidecar / Tesseract services. The registry
 * never invokes anything beyond `getStatus()` and `ocr()`, so the fakes
 * carry only what each test asserts on.
 */
function buildRegistry(opts: {
  sidecarStatus: OcrSidecarStatus;
  tesseractStatus: { healthy: boolean; reason?: string };
}): {
  registry: OcrBackendRegistry;
  sidecar: { ocr: jest.Mock; getStatus: jest.Mock };
  tesseract: { ocr: jest.Mock; getStatus: jest.Mock };
} {
  const sidecar = {
    ocr: jest.fn().mockResolvedValue([]),
    getStatus: jest.fn().mockReturnValue(opts.sidecarStatus),
  };
  const tesseract = {
    ocr: jest.fn().mockResolvedValue([]),
    getStatus: jest.fn().mockReturnValue(opts.tesseractStatus),
  };
  const registry = new OcrBackendRegistry(
    sidecar as unknown as OcrSidecarService,
    tesseract as unknown as TesseractOcrService,
  );
  return { registry, sidecar, tesseract };
}

describe('OcrBackendRegistry', () => {
  describe('pickBackend()', () => {
    it('returns the sidecar-backed backend when both are healthy', async () => {
      const { registry, sidecar, tesseract } = buildRegistry({
        sidecarStatus: { state: 'ready', modelLoaded: true },
        tesseractStatus: { healthy: true },
      });

      const backend = registry.pickBackend();
      // Smoke-test the picked backend by routing an `ocr()` through it —
      // the sidecar's mock should fire, Tesseract's must not.
      await backend.ocr('/img.jpg', [{ x: 0, y: 0, w: 1, h: 1 }]);

      expect(sidecar.ocr).toHaveBeenCalledTimes(1);
      expect(tesseract.ocr).not.toHaveBeenCalled();
    });

    it('falls back to Tesseract when the sidecar is unhealthy', async () => {
      const { registry, sidecar, tesseract } = buildRegistry({
        sidecarStatus: { state: 'unhealthy', reason: 'crashed 3x' },
        tesseractStatus: { healthy: true },
      });

      const backend = registry.pickBackend();
      await backend.ocr('/img.jpg', [{ x: 0, y: 0, w: 1, h: 1 }]);

      expect(tesseract.ocr).toHaveBeenCalledTimes(1);
      expect(sidecar.ocr).not.toHaveBeenCalled();
    });

    it('treats every non-ready sidecar state as unhealthy and falls back', () => {
      // The sidecar's lifecycle has many intermediate states; only `ready`
      // should be treated as healthy by the registry. This iterates the
      // full set so a future state addition doesn't silently start
      // routing requests to an unstarted sidecar.
      const states: OcrSidecarStatus['state'][] = [
        'not-downloaded',
        'downloading',
        'starting',
        'crashed',
        'unhealthy',
      ];
      for (const state of states) {
        const { registry, tesseract } = buildRegistry({
          sidecarStatus: { state },
          tesseractStatus: { healthy: true },
        });

        const backend = registry.pickBackend();
        // Sanity: we got tesseract, not the sidecar (nothing to assert
        // against `state` directly without exposing internals).
        expect(backend.getStatus()).toEqual({ healthy: true });
        expect(tesseract.getStatus).toHaveBeenCalled();
      }
    });

    it('throws when both backends are unhealthy', () => {
      const { registry } = buildRegistry({
        sidecarStatus: { state: 'unhealthy', reason: 'crashed 3x' },
        tesseractStatus: { healthy: false, reason: 'traineddata missing' },
      });

      expect(() => registry.pickBackend()).toThrow(/No healthy OCR backend/);
      expect(() => registry.pickBackend()).toThrow(/sidecar: crashed 3x/);
      expect(() => registry.pickBackend()).toThrow(/tesseract: traineddata missing/);
    });
  });

  describe('getFallbackStatus()', () => {
    it('returns the Tesseract status under the canonical { name: tesseract } shape', () => {
      const { registry } = buildRegistry({
        sidecarStatus: { state: 'ready' },
        tesseractStatus: { healthy: true },
      });

      expect(registry.getFallbackStatus()).toEqual({
        name: 'tesseract',
        healthy: true,
        reason: undefined,
      });
    });

    it('forwards the unhealthy reason for the K.3 settings UI', () => {
      const { registry } = buildRegistry({
        sidecarStatus: { state: 'ready' },
        tesseractStatus: { healthy: false, reason: 'traineddata not found' },
      });

      expect(registry.getFallbackStatus()).toEqual({
        name: 'tesseract',
        healthy: false,
        reason: 'traineddata not found',
      });
    });
  });
});
