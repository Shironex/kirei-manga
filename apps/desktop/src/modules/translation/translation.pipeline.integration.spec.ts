// Mock the cache barrel BEFORE importing the service so jest hoists it ahead
// of the require chain. We stub `pageHash` (otherwise the service would try to
// stream-hash a real file from disk) but keep the real `TranslationCacheService`
// re-export — the whole point of this spec is to wire the orchestrator against
// a real cache backed by an in-memory sql.js DB. The F.3 unit spec uses the
// same `requireActual` shape; mirrored here for consistency.
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
  AppSettings,
  BoundingBox,
  BubbleDetectionResult,
  OcrResult,
  TranslationProviderId,
} from '@kireimanga/shared';
import type { BubbleDetectorService } from './bubble-detector.service';
import type { TranslationProviderRegistry } from './providers';
import type { OcrBackend, OcrBackendRegistry } from './sidecar';
import type { PageUrlResolverService } from '../shared/page-url-resolver';
import type { SettingsService } from '../settings';
import { createTestDatabase, type CompatDatabase } from '../database/__test__/sqljs-adapter';
import type { DatabaseService } from '../database';
import { TranslationCacheService } from './cache';
import { TranslationService } from './translation.service';

const PAGE_PATH = '/library/series/ch01/page-001.jpg';
const PAGE_HASH = 'a'.repeat(64);

const box = (x: number, y: number, w = 100, h = 50): BoundingBox => ({ x, y, w, h });

function makeDetection(boxes: BoundingBox[]): BubbleDetectionResult {
  return {
    boxes,
    imageWidth: 1500,
    imageHeight: 2200,
    durationMs: 50,
  };
}

function makeOcr(texts: string[]): OcrResult[] {
  return texts.map((text, boxIndex) => ({ boxIndex, text }));
}

interface Mocks {
  detector: { detect: jest.Mock };
  sidecar: { ocr: jest.Mock };
  ocrBackends: { pickBackend: jest.Mock };
  registry: { pickProvider: jest.Mock };
  provider: {
    id: Exclude<TranslationProviderId, 'tesseract-only'>;
    translate: jest.Mock;
    status: jest.Mock;
  };
}

function buildMocks(
  providerId: Exclude<TranslationProviderId, 'tesseract-only'> = 'deepl',
): Mocks {
  const provider = {
    id: providerId,
    translate: jest.fn(),
    status: jest.fn(),
  };
  const sidecar = { ocr: jest.fn() };
  // Same wrapping pattern as F.3's unit spec: hand the orchestrator a
  // sidecar-flavoured backend so existing assertions on `mocks.sidecar.ocr`
  // continue to fire, post-K.2.
  const sidecarBackend: OcrBackend = {
    ocr: (...args) => sidecar.ocr(...args),
    getStatus: () => ({ healthy: true }),
  };
  return {
    detector: { detect: jest.fn() },
    sidecar,
    ocrBackends: { pickBackend: jest.fn().mockReturnValue(sidecarBackend) },
    registry: { pickProvider: jest.fn().mockResolvedValue(provider) },
    provider,
  };
}

/**
 * Integration spec: `TranslationService` wired against a REAL
 * `TranslationCacheService` (in-memory sql.js DB, full migration set applied).
 * Detector / sidecar / provider stay mocked — exercising those for real would
 * require the native bubble-detector addon, the Python OCR sidecar, and a live
 * DeepL key, which is a separate (out-of-scope) full e2e test.
 *
 * F.3's unit spec asserts call counts against a mocked cache; this one asserts
 * the cache actually persists rows and that a second pipeline call short-circuits.
 */
describe('TranslationService pipeline integration', () => {
  let db: CompatDatabase;
  let cache: TranslationCacheService;
  let service: TranslationService;
  let mocks: Mocks;

  beforeEach(async () => {
    db = await createTestDatabase();
    const dbService = { db } as unknown as DatabaseService;
    cache = new TranslationCacheService(dbService);
    cache.onModuleInit();

    mockPageHash.mockReset();
    mockPageHash.mockResolvedValue(PAGE_HASH);

    mocks = buildMocks();
    // Resolver is unused in this spec — every test passes `pageImagePath`
    // directly so the explicit-path branch wins. Stubbed so the dep slot
    // stays satisfied.
    const resolver = {
      resolveToFilesystemPath: jest
        .fn()
        .mockRejectedValue(new Error('resolver should not be called')),
    } as unknown as PageUrlResolverService;
    // Settings stub — the orchestrator reads settings.translation.sourceLang
    // when the payload doesn't carry one. Default `'ja'` mirrors
    // DEFAULT_APP_SETTINGS so the pre-Phase-2 pipeline behaviour is preserved
    // for every test in this suite.
    const settings = {
      get: jest.fn().mockReturnValue({
        translation: { sourceLang: 'ja' },
      } as unknown as AppSettings),
    } as unknown as SettingsService;
    service = new TranslationService(
      mocks.detector as unknown as BubbleDetectorService,
      mocks.ocrBackends as unknown as OcrBackendRegistry,
      mocks.registry as unknown as TranslationProviderRegistry,
      cache,
      resolver,
      settings,
    );
  });

  afterEach(() => {
    db.close();
  });

  it('persists every translated bubble on the first call and reads from cache on the second', async () => {
    mocks.detector.detect.mockResolvedValue(
      makeDetection([box(10, 20, 100, 50), box(200, 30, 80, 40)]),
    );
    mocks.sidecar.ocr.mockResolvedValue(makeOcr(['こんにちは', 'さようなら']));
    mocks.provider.translate.mockResolvedValue(['hello', 'goodbye']);

    const result1 = await service.runPipeline({
      pageImagePath: PAGE_PATH,
      targetLang: 'en',
    });

    expect(result1.pageHash).toBe(PAGE_HASH);
    expect(result1.bubbles).toHaveLength(2);
    expect(result1.bubbles[0]).toMatchObject({
      original: 'こんにちは',
      translated: 'hello',
      provider: 'deepl',
      targetLang: 'en',
    });
    expect(result1.bubbles[1]).toMatchObject({
      original: 'さようなら',
      translated: 'goodbye',
      provider: 'deepl',
      targetLang: 'en',
    });
    expect(mocks.detector.detect).toHaveBeenCalledTimes(1);
    expect(mocks.sidecar.ocr).toHaveBeenCalledTimes(1);
    expect(mocks.provider.translate).toHaveBeenCalledTimes(1);
    expect(cache.count()).toBe(2);

    // Second call — same key — should hit the cache and not re-run any
    // pipeline stage. Result must be byte-equivalent to the first call.
    const result2 = await service.runPipeline({
      pageImagePath: PAGE_PATH,
      targetLang: 'en',
    });

    expect(result2).toEqual(result1);
    expect(mocks.detector.detect).toHaveBeenCalledTimes(1);
    expect(mocks.sidecar.ocr).toHaveBeenCalledTimes(1);
    expect(mocks.provider.translate).toHaveBeenCalledTimes(1);
    expect(cache.count()).toBe(2);
  });

  it('different targetLang misses cache — pipeline re-runs and a parallel set of rows is written', async () => {
    mocks.detector.detect.mockResolvedValue(
      makeDetection([box(10, 20), box(200, 30)]),
    );
    mocks.sidecar.ocr.mockResolvedValue(makeOcr(['こんにちは', 'さようなら']));
    mocks.provider.translate
      .mockResolvedValueOnce(['hello', 'goodbye'])
      .mockResolvedValueOnce(['cześć', 'do widzenia']);

    await service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' });
    expect(cache.count()).toBe(2);

    const plResult = await service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'pl' });

    expect(mocks.detector.detect).toHaveBeenCalledTimes(2);
    expect(mocks.sidecar.ocr).toHaveBeenCalledTimes(2);
    expect(mocks.provider.translate).toHaveBeenCalledTimes(2);
    expect(cache.count()).toBe(4);
    expect(plResult.bubbles.map(b => b.translated)).toEqual(['cześć', 'do widzenia']);
    expect(plResult.bubbles.every(b => b.targetLang === 'pl')).toBe(true);

    // Original 'en' rows still resolve from cache.
    const enHit = cache.getForPage(PAGE_HASH, 'en', 'deepl');
    expect(enHit!.bubbles.map(b => b.translated)).toEqual(['hello', 'goodbye']);
  });

  it('different provider misses cache — registry resolving to a different provider id forces a re-run', async () => {
    mocks.detector.detect.mockResolvedValue(
      makeDetection([box(10, 20), box(200, 30)]),
    );
    mocks.sidecar.ocr.mockResolvedValue(makeOcr(['こんにちは', 'さようなら']));
    mocks.provider.translate.mockResolvedValue(['hello', 'goodbye']);

    await service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' });
    expect(cache.count()).toBe(2);

    // Swap in a Google provider — the same hash + lang must NOT short-circuit
    // because the cache key includes provider id.
    const googleProvider = {
      id: 'google' as const,
      translate: jest.fn().mockResolvedValue(['hi', 'bye']),
      status: jest.fn(),
    };
    mocks.registry.pickProvider.mockResolvedValue(googleProvider);

    const result = await service.runPipeline({
      pageImagePath: PAGE_PATH,
      targetLang: 'en',
      providerHint: 'google',
    });

    expect(mocks.detector.detect).toHaveBeenCalledTimes(2);
    expect(mocks.sidecar.ocr).toHaveBeenCalledTimes(2);
    expect(googleProvider.translate).toHaveBeenCalledTimes(1);
    expect(cache.count()).toBe(4);
    expect(result.bubbles.every(b => b.provider === 'google')).toBe(true);
    expect(result.bubbles.map(b => b.translated)).toEqual(['hi', 'bye']);
  });

  it('provider failure during translate leaves the cache untouched (batch translate is all-or-nothing)', async () => {
    mocks.detector.detect.mockResolvedValue(
      makeDetection([box(0, 0), box(100, 0), box(200, 0)]),
    );
    mocks.sidecar.ocr.mockResolvedValue(makeOcr(['一', '二', '三']));
    mocks.provider.translate.mockRejectedValue(new Error('deepl 429'));

    await expect(
      service.runPipeline({ pageImagePath: PAGE_PATH, targetLang: 'en' }),
    ).rejects.toThrow(/deepl 429/);

    expect(cache.count()).toBe(0);
    expect(cache.getForPage(PAGE_HASH, 'en', 'deepl')).toBeNull();
  });
});
