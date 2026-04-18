// Mocks must be declared before importing the service so jest hoists them
// ahead of the require chain. We stub `pageHash` because the service hashes a
// real file path and we don't want to touch disk.
const mockPageHash = jest.fn();
jest.mock('./cache', () => {
  const actual = jest.requireActual('./cache');
  return {
    __esModule: true,
    ...actual,
    pageHash: (...args: unknown[]) => mockPageHash(...args),
  };
});

import type {
  BoundingBox,
  BubbleDetectionResult,
  OcrResult,
  PageTranslation,
  TranslationProviderId,
} from '@kireimanga/shared';
import type { BubbleDetectorService } from './bubble-detector.service';
import type { TranslationCacheService } from './cache';
import type { TranslationProvider, TranslationProviderRegistry } from './providers';
import type { OcrSidecarService } from './sidecar';
import { TranslationService } from './translation.service';

const PAGE_PATH = '/library/series/ch01/page-001.jpg';
const PAGE_HASH = 'a'.repeat(64);

const box = (x: number, y: number, w = 50, h = 60): BoundingBox => ({ x, y, w, h });

function makeDetection(boxes: BoundingBox[]): BubbleDetectionResult {
  return {
    boxes,
    imageWidth: 1500,
    imageHeight: 2200,
    durationMs: 12.3,
  };
}

function makeOcr(texts: string[]): OcrResult[] {
  return texts.map((text, boxIndex) => ({ boxIndex, text }));
}

interface Collaborators {
  detector: { detect: jest.Mock };
  sidecar: { ocr: jest.Mock };
  registry: { pickProvider: jest.Mock };
  cache: { getForPage: jest.Mock; putBubble: jest.Mock };
  provider: {
    id: Exclude<TranslationProviderId, 'tesseract-only'>;
    translate: jest.Mock;
    status: jest.Mock;
  };
}

function buildService(
  overrides: Partial<{
    providerId: Exclude<TranslationProviderId, 'tesseract-only'>;
    translate: jest.Mock;
    status: jest.Mock;
  }> = {},
): { service: TranslationService; collab: Collaborators } {
  const providerId = overrides.providerId ?? 'deepl';
  const provider = {
    id: providerId,
    translate: overrides.translate ?? jest.fn(),
    status: overrides.status ?? jest.fn(),
  };
  const detector = { detect: jest.fn() };
  const sidecar = { ocr: jest.fn() };
  const registry = { pickProvider: jest.fn().mockResolvedValue(provider) };
  const cache = { getForPage: jest.fn().mockReturnValue(null), putBubble: jest.fn() };

  const service = new TranslationService(
    detector as unknown as BubbleDetectorService,
    sidecar as unknown as OcrSidecarService,
    registry as unknown as TranslationProviderRegistry,
    cache as unknown as TranslationCacheService,
  );

  return {
    service,
    collab: {
      detector,
      sidecar,
      registry,
      cache,
      provider: provider as Collaborators['provider'],
    },
  };
}

describe('TranslationService.runPipeline', () => {
  beforeEach(() => {
    mockPageHash.mockReset();
    mockPageHash.mockResolvedValue(PAGE_HASH);
  });

  it('cache hit short-circuits — no detector / sidecar / provider calls', async () => {
    const cached: PageTranslation = {
      pageHash: PAGE_HASH,
      bubbles: [
        {
          box: box(10, 20),
          original: 'こんにちは',
          translated: 'Hello',
          provider: 'deepl',
          targetLang: 'en',
        },
      ],
    };
    const { service, collab } = buildService();
    collab.cache.getForPage.mockReturnValue(cached);

    const result = await service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' });

    expect(result).toBe(cached);
    expect(collab.cache.getForPage).toHaveBeenCalledWith(PAGE_HASH, 'en', 'deepl');
    expect(collab.detector.detect).not.toHaveBeenCalled();
    expect(collab.sidecar.ocr).not.toHaveBeenCalled();
    expect(collab.provider.translate).not.toHaveBeenCalled();
    expect(collab.cache.putBubble).not.toHaveBeenCalled();
  });

  it('returns an empty result when the detector finds no bubbles', async () => {
    const { service, collab } = buildService();
    collab.detector.detect.mockResolvedValue(makeDetection([]));

    const result = await service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' });

    expect(result).toEqual({ pageHash: PAGE_HASH, bubbles: [] });
    expect(collab.sidecar.ocr).not.toHaveBeenCalled();
    expect(collab.provider.translate).not.toHaveBeenCalled();
    expect(collab.cache.putBubble).not.toHaveBeenCalled();
  });

  it('happy path — translates every bubble and writes one cache row per bubble in order', async () => {
    const boxes = [box(0, 0), box(100, 0), box(200, 0)];
    const { service, collab } = buildService();
    collab.detector.detect.mockResolvedValue(makeDetection(boxes));
    collab.sidecar.ocr.mockResolvedValue(makeOcr(['一', '二', '三']));
    collab.provider.translate.mockResolvedValue(['one', 'two', 'three']);

    const result = await service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' });

    expect(collab.provider.translate).toHaveBeenCalledWith(['一', '二', '三'], 'en');
    expect(result.pageHash).toBe(PAGE_HASH);
    expect(result.bubbles).toHaveLength(3);
    expect(result.bubbles.map(b => b.translated)).toEqual(['one', 'two', 'three']);
    expect(result.bubbles.map(b => b.original)).toEqual(['一', '二', '三']);
    expect(result.bubbles.every(b => b.provider === 'deepl')).toBe(true);
    expect(result.bubbles.every(b => b.targetLang === 'en')).toBe(true);

    expect(collab.cache.putBubble).toHaveBeenCalledTimes(3);
    const calls = collab.cache.putBubble.mock.calls.map(([arg]) => arg);
    expect(calls.map(c => c.bubbleIndex)).toEqual([0, 1, 2]);
    expect(calls[0]).toMatchObject({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: boxes[0],
      original: '一',
      translated: 'one',
      targetLang: 'en',
      provider: 'deepl',
    });
  });

  it('skips empty OCR text from the translate batch and from the cache, preserving box order', async () => {
    const boxes = [box(0, 0), box(100, 0), box(200, 0)];
    const { service, collab } = buildService();
    collab.detector.detect.mockResolvedValue(makeDetection(boxes));
    // Bubble 1 OCRs to empty (whitespace) — should never reach the provider
    // and should never be cached, but must still appear in the result.
    collab.sidecar.ocr.mockResolvedValue(makeOcr(['一', '   ', '三']));
    collab.provider.translate.mockResolvedValue(['one', 'three']);

    const result = await service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' });

    expect(collab.provider.translate).toHaveBeenCalledWith(['一', '三'], 'en');
    expect(result.bubbles).toHaveLength(3);
    expect(result.bubbles[0]).toMatchObject({ original: '一', translated: 'one' });
    expect(result.bubbles[1]).toMatchObject({ original: '   ', translated: '' });
    expect(result.bubbles[2]).toMatchObject({ original: '三', translated: 'three' });

    expect(collab.cache.putBubble).toHaveBeenCalledTimes(2);
    const indices = collab.cache.putBubble.mock.calls.map(([arg]) => arg.bubbleIndex);
    expect(indices).toEqual([0, 2]);
  });

  it('propagates provider errors and writes nothing to the cache (batch translate is all-or-nothing)', async () => {
    const boxes = [box(0, 0), box(100, 0)];
    const { service, collab } = buildService();
    collab.detector.detect.mockResolvedValue(makeDetection(boxes));
    collab.sidecar.ocr.mockResolvedValue(makeOcr(['一', '二']));
    collab.provider.translate.mockRejectedValue(new Error('deepl 429'));

    await expect(
      service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' }),
    ).rejects.toThrow(/deepl 429/);

    expect(collab.cache.putBubble).not.toHaveBeenCalled();
  });

  it("forwards the provider hint to the registry's pickProvider", async () => {
    const { service, collab } = buildService({ providerId: 'google' });
    collab.detector.detect.mockResolvedValue(makeDetection([]));

    await service.runPipeline({
      pageImagePath: PAGE_PATH,
      targetLang: 'en',
      providerHint: 'google',
    });

    expect(collab.registry.pickProvider).toHaveBeenCalledWith('google');
  });

  it("forwards the direction option to the bubble detector (default 'rtl', explicit 'ltr')", async () => {
    {
      const { service, collab } = buildService();
      collab.detector.detect.mockResolvedValue(makeDetection([]));
      await service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' });
      expect(collab.detector.detect).toHaveBeenCalledWith(PAGE_PATH, { direction: 'rtl' });
    }
    {
      const { service, collab } = buildService();
      collab.detector.detect.mockResolvedValue(makeDetection([]));
      await service.runPipeline({
        pageImagePath: PAGE_PATH,
        targetLang: 'en',
        direction: 'ltr',
      });
      expect(collab.detector.detect).toHaveBeenCalledWith(PAGE_PATH, { direction: 'ltr' });
    }
  });
});
