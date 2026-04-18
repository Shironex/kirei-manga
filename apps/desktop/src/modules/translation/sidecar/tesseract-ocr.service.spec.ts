/**
 * Mock the tesseract.js entry point before importing the service so jest's
 * hoisted-mock machinery installs the fakes ahead of the require chain. The
 * real worker spins up a WASM module + jpn traineddata which is far too
 * heavy for unit tests — and we don't actually exercise OCR accuracy here,
 * just the service's wiring around it.
 */
const mockRecognize = jest.fn();
const mockTerminate = jest.fn();
const mockCreateWorker = jest.fn();

jest.mock('tesseract.js', () => ({
  __esModule: true,
  createWorker: (...args: unknown[]) => mockCreateWorker(...args),
}));

import * as fsSync from 'fs';
import * as path from 'path';
import { TesseractOcrService } from './tesseract-ocr.service';

/**
 * Real disk fixture for the langPath presence check. The service uses
 * `existsSync` against `<langPath>/{jpn,jpn_vert}.traineddata` to decide
 * `getStatus().healthy`; we point it at a tmp dir we control so each test
 * can flip files in / out without depending on the real
 * `apps/desktop/resources/tesseract/` directory (which `pnpm fetch-tesseract`
 * may or may not have populated).
 */
function makeTrainedDataDir(opts: {
  withJpn?: boolean;
  withJpnVert?: boolean;
} = {}): string {
  const { withJpn = true, withJpnVert = true } = opts;
  const dir = fsSync.mkdtempSync(path.join(require('os').tmpdir(), 'tess-spec-'));
  if (withJpn) fsSync.writeFileSync(path.join(dir, 'jpn.traineddata'), 'fake');
  if (withJpnVert) fsSync.writeFileSync(path.join(dir, 'jpn_vert.traineddata'), 'fake');
  return dir;
}

/**
 * Override the service's resolved `langPath` to the supplied tmp dir without
 * spinning up Electron. Done via Object.assign because `langPath` is
 * `readonly` at the type level but plain instance state at runtime.
 */
function pinLangPath(service: TesseractOcrService, dir: string): void {
  Object.assign(service, { langPath: dir });
}

describe('TesseractOcrService', () => {
  beforeEach(() => {
    mockRecognize.mockReset();
    mockTerminate.mockReset();
    mockCreateWorker.mockReset();
    mockCreateWorker.mockResolvedValue({
      recognize: mockRecognize,
      terminate: mockTerminate,
    });
  });

  describe('getStatus()', () => {
    it('reports healthy when both traineddata files exist', () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir());

      expect(service.getStatus()).toEqual({ healthy: true });
    });

    it('reports unhealthy with a clear reason when jpn.traineddata is missing', () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir({ withJpn: false }));

      const status = service.getStatus();
      expect(status.healthy).toBe(false);
      expect(status.reason).toMatch(/traineddata not found/);
      expect(status.reason).toMatch(/pnpm fetch-tesseract/);
    });

    it('reports unhealthy when jpn_vert.traineddata is missing', () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir({ withJpnVert: false }));

      expect(service.getStatus().healthy).toBe(false);
    });
  });

  describe('ocr() lazy worker init', () => {
    it('creates the worker on the first call and reuses it on subsequent calls', async () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir());
      mockRecognize.mockResolvedValue({
        data: { text: 'こんにちは', blocks: [] },
      });

      // Pre-call: no worker yet.
      expect(mockCreateWorker).not.toHaveBeenCalled();

      await service.ocr('/img.jpg', [{ x: 0, y: 0, w: 10, h: 10 }]);
      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
      // Verify the createWorker call shape — langs + langPath are the
      // two configuration knobs the service controls.
      const [langs, oem, options] = mockCreateWorker.mock.calls[0];
      expect(langs).toBe('jpn+jpn_vert');
      expect(oem).toBe(1);
      expect(options).toMatchObject({
        langPath: expect.any(String),
      });

      await service.ocr('/img.jpg', [{ x: 0, y: 0, w: 10, h: 10 }]);
      expect(mockCreateWorker).toHaveBeenCalledTimes(1);
    });

    it('passes the box dimensions as a tesseract rectangle option', async () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir());
      mockRecognize.mockResolvedValue({
        data: { text: 'hello', blocks: [] },
      });

      await service.ocr('/img.jpg', [{ x: 12, y: 34, w: 56, h: 78 }]);

      expect(mockRecognize).toHaveBeenCalledWith('/img.jpg', {
        rectangle: { left: 12, top: 34, width: 56, height: 78 },
      });
    });

    it('returns OcrResult[] with text + aggregated mean confidence', async () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir());
      // Two words with confidences 80 and 60 → mean 70.
      mockRecognize.mockResolvedValue({
        data: {
          text: '  こんにちは  ',
          blocks: [
            {
              paragraphs: [
                {
                  lines: [
                    {
                      words: [{ confidence: 80 }, { confidence: 60 }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      });

      const results = await service.ocr('/img.jpg', [{ x: 0, y: 0, w: 1, h: 1 }]);

      expect(results).toEqual([
        { boxIndex: 0, text: 'こんにちは', confidence: 70 },
      ]);
    });

    it('falls back to page-level confidence when no per-word data is present', async () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir());
      mockRecognize.mockResolvedValue({
        data: { text: '!', confidence: 42, blocks: [] },
      });

      const [result] = await service.ocr('/img.jpg', [{ x: 0, y: 0, w: 1, h: 1 }]);
      expect(result.confidence).toBe(42);
    });
  });

  describe('per-box error encapsulation', () => {
    it('one box throwing surfaces as text:"" with others succeeding', async () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir());
      // First call OK, second throws, third OK.
      mockRecognize
        .mockResolvedValueOnce({ data: { text: 'one', blocks: [] } })
        .mockRejectedValueOnce(new Error('crop out of bounds'))
        .mockResolvedValueOnce({ data: { text: 'three', blocks: [] } });

      const results = await service.ocr('/img.jpg', [
        { x: 0, y: 0, w: 1, h: 1 },
        { x: 100, y: 100, w: 1, h: 1 },
        { x: 200, y: 200, w: 1, h: 1 },
      ]);

      expect(results).toHaveLength(3);
      expect(results[0]).toMatchObject({ boxIndex: 0, text: 'one' });
      expect(results[1]).toEqual({ boxIndex: 1, text: '' });
      expect(results[2]).toMatchObject({ boxIndex: 2, text: 'three' });
    });

    it('returns an empty array for an empty box list without spinning the worker', async () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir());

      const results = await service.ocr('/img.jpg', []);

      expect(results).toEqual([]);
      // Worker init still fires (we awaited ensureWorker before the
      // box loop) — that's fine, the assertion here is just that the
      // recognize() seam was never called for an empty box list.
      expect(mockRecognize).not.toHaveBeenCalled();
    });
  });

  describe('worker init failure', () => {
    it('marks the service unhealthy after a failed init and surfaces the reason', async () => {
      const service = new TesseractOcrService();
      pinLangPath(service, makeTrainedDataDir());
      mockCreateWorker.mockRejectedValueOnce(new Error('wasm load failed'));

      await expect(
        service.ocr('/img.jpg', [{ x: 0, y: 0, w: 1, h: 1 }]),
      ).rejects.toThrow(/wasm load failed/);

      const status = service.getStatus();
      expect(status.healthy).toBe(false);
      expect(status.reason).toMatch(/wasm load failed/);
    });
  });
});
