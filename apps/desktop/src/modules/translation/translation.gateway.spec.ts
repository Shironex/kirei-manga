import { Test, type TestingModule } from '@nestjs/testing';
import type { PageTranslation } from '@kireimanga/shared';
import { TranslationGateway } from './translation.gateway';
import { BubbleDetectorService } from './bubble-detector.service';
import { TranslationCacheService } from './cache';
import { TranslationProviderRegistry } from './providers';
import { OcrBackendRegistry, OcrSidecarService } from './sidecar';
import { TranslationService } from './translation.service';
import { DatabaseService } from '../database';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';

/**
 * Unit-level coverage for the gateway's three channels:
 * `translation:provider-status` (D.5), `translation:run-pipeline` (F.4),
 * and `translation:get-page` (F.4). The gateway is pure-mapping over the
 * underlying services, so we mock every collaborator and assert the wire
 * shape. The throttler guard is overridden with a permissive stand-in —
 * rate-limit behaviour is covered by the dedicated `WsThrottlerGuard` suite.
 */
describe('TranslationGateway', () => {
  let module: TestingModule;
  let gateway: TranslationGateway;
  let bubbleDetector: { getStatus: jest.Mock };
  let ocrSidecar: { getStatus: jest.Mock };
  let ocrBackends: { getFallbackStatus: jest.Mock; pickBackend: jest.Mock };
  let registry: { getAllStatuses: jest.Mock };
  let translationService: { runPipeline: jest.Mock };
  let cacheService: { getForPage: jest.Mock };
  // The gateway's `set-series-override` handler runs raw SQL through the
  // shared DatabaseService, so the spec stubs `prepare(...).run()` /
  // `prepare(...).get()` behind a chainable mock. Each test sets the row the
  // SELECT returns (or `undefined` to simulate a deleted series).
  let database: {
    db: {
      prepare: jest.Mock;
    };
    runMock: jest.Mock;
    getMock: jest.Mock;
  };

  beforeEach(async () => {
    bubbleDetector = { getStatus: jest.fn() };
    ocrSidecar = { getStatus: jest.fn() };
    ocrBackends = {
      getFallbackStatus: jest
        .fn()
        .mockReturnValue({ name: 'tesseract', healthy: true }),
      pickBackend: jest.fn(),
    };
    registry = { getAllStatuses: jest.fn().mockResolvedValue([]) };
    translationService = { runPipeline: jest.fn() };
    cacheService = { getForPage: jest.fn() };

    const runMock = jest.fn();
    const getMock = jest.fn();
    database = {
      db: {
        prepare: jest.fn(() => ({ run: runMock, get: getMock })),
      },
      runMock,
      getMock,
    };

    module = await Test.createTestingModule({
      providers: [
        TranslationGateway,
        { provide: BubbleDetectorService, useValue: bubbleDetector },
        { provide: OcrSidecarService, useValue: ocrSidecar },
        { provide: OcrBackendRegistry, useValue: ocrBackends },
        { provide: TranslationProviderRegistry, useValue: registry },
        { provide: TranslationService, useValue: translationService },
        { provide: TranslationCacheService, useValue: cacheService },
        { provide: DatabaseService, useValue: database },
      ],
    })
      .overrideGuard(WsThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    gateway = module.get(TranslationGateway);
  });

  afterEach(async () => {
    if (module) await module.close();
  });

  it('returns empty providers + healthy pipeline when both components are ready', async () => {
    bubbleDetector.getStatus.mockReturnValue({ healthy: true });
    ocrSidecar.getStatus.mockReturnValue({ state: 'ready', modelLoaded: true });

    const result = await gateway.handleProviderStatus();

    expect(result).toEqual({
      providers: [],
      pipeline: {
        bubbleDetector: { healthy: true, reason: undefined },
        ocrSidecar: {
          state: 'ready',
          reason: undefined,
          modelLoaded: true,
          downloadProgress: undefined,
        },
        ocrFallback: { name: 'tesseract', healthy: true },
      },
    });
    expect(result).not.toHaveProperty('error');
  });

  // ===== K.2 — Tesseract fallback row =====

  it('surfaces the Tesseract fallback status under pipeline.ocrFallback', async () => {
    bubbleDetector.getStatus.mockReturnValue({ healthy: true });
    ocrSidecar.getStatus.mockReturnValue({ state: 'ready', modelLoaded: true });
    ocrBackends.getFallbackStatus.mockReturnValue({
      name: 'tesseract',
      healthy: false,
      reason: 'traineddata not found',
    });

    const result = await gateway.handleProviderStatus();

    expect(ocrBackends.getFallbackStatus).toHaveBeenCalledTimes(1);
    expect(result.pipeline.ocrFallback).toEqual({
      name: 'tesseract',
      healthy: false,
      reason: 'traineddata not found',
    });
  });

  it('surfaces the bubble detector failure reason in the pipeline block', async () => {
    bubbleDetector.getStatus.mockReturnValue({
      healthy: false,
      reason: 'No native build was found for platform=win32 arch=x64',
    });
    ocrSidecar.getStatus.mockReturnValue({ state: 'ready', modelLoaded: true });

    const result = await gateway.handleProviderStatus();

    expect(result.pipeline.bubbleDetector).toEqual({
      healthy: false,
      reason: 'No native build was found for platform=win32 arch=x64',
    });
    expect(result.pipeline.ocrSidecar.state).toBe('ready');
  });

  it('includes downloadProgress when the sidecar is downloading', async () => {
    bubbleDetector.getStatus.mockReturnValue({ healthy: true });
    ocrSidecar.getStatus.mockReturnValue({
      state: 'downloading',
      downloadProgress: { bytes: 1_048_576, total: 41_943_040 },
    });

    const result = await gateway.handleProviderStatus();

    expect(result.pipeline.ocrSidecar).toEqual({
      state: 'downloading',
      reason: undefined,
      modelLoaded: undefined,
      downloadProgress: { bytes: 1_048_576, total: 41_943_040 },
    });
  });

  it('returns the default pipeline + error string when a service throws', async () => {
    bubbleDetector.getStatus.mockImplementation(() => {
      throw new Error('boom');
    });
    ocrSidecar.getStatus.mockReturnValue({ state: 'ready' });

    const result = (await gateway.handleProviderStatus()) as {
      providers: unknown[];
      pipeline: { bubbleDetector: { healthy: boolean }; ocrSidecar: { state: string } };
      error: string;
    };

    expect(result.providers).toEqual([]);
    expect(result.pipeline.bubbleDetector.healthy).toBe(false);
    expect(result.pipeline.ocrSidecar.state).toBe('not-downloaded');
    expect(result.error).toBe('boom');
  });

  it('forwards the registry-reported provider statuses to the renderer', async () => {
    bubbleDetector.getStatus.mockReturnValue({ healthy: true });
    ocrSidecar.getStatus.mockReturnValue({ state: 'ready', modelLoaded: true });
    registry.getAllStatuses.mockResolvedValue([
      { id: 'deepl', ok: true, remainingChars: 12345 },
    ]);

    const result = await gateway.handleProviderStatus();

    expect(registry.getAllStatuses).toHaveBeenCalledTimes(1);
    expect(result.providers).toEqual([{ id: 'deepl', ok: true, remainingChars: 12345 }]);
  });

  // ===== F.4 — translation:run-pipeline =====

  it('handleRunPipeline wraps the orchestrator result in a `page` envelope', async () => {
    const page: PageTranslation = {
      pageHash: 'b'.repeat(64),
      bubbles: [
        {
          box: { x: 10, y: 20, w: 50, h: 60 },
          original: 'こんにちは',
          translated: 'Hello',
          provider: 'deepl',
          targetLang: 'en',
        },
      ],
    };
    translationService.runPipeline.mockResolvedValue(page);

    const result = await gateway.handleRunPipeline({
      pageImagePath: '/library/series/ch01/page-001.jpg',
      targetLang: 'en',
      providerHint: 'deepl',
    });

    expect(translationService.runPipeline).toHaveBeenCalledWith({
      pageImagePath: '/library/series/ch01/page-001.jpg',
      pageUrl: undefined,
      targetLang: 'en',
      providerHint: 'deepl',
    });
    expect(result).toEqual({ page });
    expect(result).not.toHaveProperty('error');
  });

  it('handleRunPipeline rejects when neither pageImagePath nor pageUrl is provided', async () => {
    const result = (await gateway.handleRunPipeline({
      pageImagePath: '',
      targetLang: 'en',
    })) as { page: PageTranslation; error: string };

    expect(translationService.runPipeline).not.toHaveBeenCalled();
    expect(result.page).toEqual({ pageHash: '', bubbles: [] });
    expect(result.error).toMatch(/pageImagePath \/ pageUrl/);
  });

  it('handleRunPipeline rejects when both pageImagePath and pageUrl are provided', async () => {
    const result = (await gateway.handleRunPipeline({
      pageImagePath: '/library/series/ch01/page-001.jpg',
      pageUrl: 'kirei-page://mangadex/ch01/page-001.jpg',
      targetLang: 'en',
    })) as { page: PageTranslation; error: string };

    expect(translationService.runPipeline).not.toHaveBeenCalled();
    expect(result.page).toEqual({ pageHash: '', bubbles: [] });
    expect(result.error).toMatch(/pageImagePath \/ pageUrl/);
  });

  it('handleRunPipeline forwards a pageUrl payload to the orchestrator', async () => {
    const page: PageTranslation = {
      pageHash: 'e'.repeat(64),
      bubbles: [],
    };
    translationService.runPipeline.mockResolvedValue(page);

    const result = await gateway.handleRunPipeline({
      pageUrl: 'kirei-page://mangadex/ch01/page-001.jpg',
      targetLang: 'en',
      providerHint: 'deepl',
    });

    expect(translationService.runPipeline).toHaveBeenCalledWith({
      pageImagePath: undefined,
      pageUrl: 'kirei-page://mangadex/ch01/page-001.jpg',
      targetLang: 'en',
      providerHint: 'deepl',
    });
    expect(result).toEqual({ page });
    expect(result).not.toHaveProperty('error');
  });

  it('handleRunPipeline propagates orchestrator errors via the gateway-handler envelope', async () => {
    translationService.runPipeline.mockRejectedValue(new Error('no healthy provider'));

    const result = (await gateway.handleRunPipeline({
      pageImagePath: '/library/series/ch01/page-001.jpg',
      targetLang: 'en',
    })) as { page: PageTranslation; error: string };

    expect(translationService.runPipeline).toHaveBeenCalledTimes(1);
    expect(result.page).toEqual({ pageHash: '', bubbles: [] });
    expect(result.error).toBe('no healthy provider');
  });

  // ===== F.4 — translation:get-page =====

  it('handleGetPage returns the cached page for a known (hash, lang, provider) tuple', async () => {
    const cached: PageTranslation = {
      pageHash: 'c'.repeat(64),
      bubbles: [
        {
          box: { x: 0, y: 0, w: 100, h: 80 },
          original: '一',
          translated: 'one',
          provider: 'deepl',
          targetLang: 'en',
        },
      ],
    };
    cacheService.getForPage.mockReturnValue(cached);

    const result = await gateway.handleGetPage({
      pageHash: cached.pageHash,
      targetLang: 'en',
      provider: 'deepl',
    });

    expect(cacheService.getForPage).toHaveBeenCalledWith(cached.pageHash, 'en', 'deepl');
    expect(result).toEqual({ page: cached });
    expect(result).not.toHaveProperty('error');
  });

  it('handleGetPage returns `{ page: null }` on a cache miss', async () => {
    cacheService.getForPage.mockReturnValue(null);

    const result = await gateway.handleGetPage({
      pageHash: 'd'.repeat(64),
      targetLang: 'en',
      provider: 'deepl',
    });

    expect(result).toEqual({ page: null });
    expect(result).not.toHaveProperty('error');
  });

  it('handleGetPage rejects an empty pageHash without hitting the cache', async () => {
    const result = (await gateway.handleGetPage({
      pageHash: '',
      targetLang: 'en',
      provider: 'deepl',
    })) as { page: PageTranslation | null; error: string };

    expect(cacheService.getForPage).not.toHaveBeenCalled();
    expect(result.page).toBeNull();
    expect(result.error).toMatch(/pageHash/);
  });

  // ===== H.2 — translation:set-series-override =====

  it('handleSetSeriesOverride stores the override as JSON and rehydrates the row', async () => {
    database.getMock.mockReturnValue({
      id: 'series-1',
      title: 'Berserk',
      title_japanese: 'ベルセルク',
      cover_path: null,
      source: 'mangadex',
      mangadex_id: 'mdx-1',
      status: 'reading',
      score: 9,
      notes: null,
      added_at: '2026-01-01T00:00:00.000Z',
      last_read_at: null,
      last_chapter_id: null,
      last_checked_at: null,
      new_chapter_count: null,
      local_root_path: null,
      local_content_hash: null,
      translation_override: '{"targetLang":"pl","autoTranslate":true}',
    });

    const result = await gateway.handleSetSeriesOverride({
      seriesId: 'series-1',
      override: { targetLang: 'pl', autoTranslate: true },
    });

    expect(database.db.prepare).toHaveBeenCalledWith(
      'UPDATE series SET translation_override = ? WHERE id = ?'
    );
    expect(database.runMock).toHaveBeenCalledWith(
      JSON.stringify({ targetLang: 'pl', autoTranslate: true }),
      'series-1'
    );
    expect(result).toEqual({
      series: expect.objectContaining({
        id: 'series-1',
        title: 'Berserk',
        source: 'mangadex',
        translationOverride: { targetLang: 'pl', autoTranslate: true },
      }),
    });
    expect(result).not.toHaveProperty('error');
  });

  it('handleSetSeriesOverride writes NULL when override is undefined (clear)', async () => {
    database.getMock.mockReturnValue({
      id: 'series-2',
      title: 'Vagabond',
      title_japanese: null,
      cover_path: null,
      source: 'local',
      mangadex_id: null,
      status: 'reading',
      score: null,
      notes: null,
      added_at: '2026-01-01T00:00:00.000Z',
      last_read_at: null,
      last_chapter_id: null,
      last_checked_at: null,
      new_chapter_count: null,
      local_root_path: '/library/vagabond',
      local_content_hash: null,
      translation_override: null,
    });

    const result = await gateway.handleSetSeriesOverride({
      seriesId: 'series-2',
      override: undefined,
    });

    expect(database.runMock).toHaveBeenCalledWith(null, 'series-2');
    expect(result.series?.translationOverride).toBeUndefined();
  });

  it('handleSetSeriesOverride returns `{ series: null }` when the row no longer exists', async () => {
    database.getMock.mockReturnValue(undefined);

    const result = await gateway.handleSetSeriesOverride({
      seriesId: 'gone',
      override: { targetLang: 'pl' },
    });

    expect(result).toEqual({ series: null });
    expect(result).not.toHaveProperty('error');
  });

  it('handleSetSeriesOverride rejects an empty seriesId without writing', async () => {
    const result = (await gateway.handleSetSeriesOverride({
      seriesId: '',
      override: { targetLang: 'pl' },
    })) as { series: null; error: string };

    expect(database.db.prepare).not.toHaveBeenCalled();
    expect(result.series).toBeNull();
    expect(result.error).toMatch(/seriesId/);
  });
});
