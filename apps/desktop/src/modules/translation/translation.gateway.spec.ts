import { Test, type TestingModule } from '@nestjs/testing';
import type { PageTranslation } from '@kireimanga/shared';
import { TranslationGateway } from './translation.gateway';
import { BubbleDetectorService } from './bubble-detector.service';
import { TranslationCacheService } from './cache';
import { TranslationProviderRegistry } from './providers';
import { OcrSidecarService } from './sidecar';
import { TranslationService } from './translation.service';
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
  let registry: { getAllStatuses: jest.Mock };
  let translationService: { runPipeline: jest.Mock };
  let cacheService: { getForPage: jest.Mock };

  beforeEach(async () => {
    bubbleDetector = { getStatus: jest.fn() };
    ocrSidecar = { getStatus: jest.fn() };
    registry = { getAllStatuses: jest.fn().mockResolvedValue([]) };
    translationService = { runPipeline: jest.fn() };
    cacheService = { getForPage: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        TranslationGateway,
        { provide: BubbleDetectorService, useValue: bubbleDetector },
        { provide: OcrSidecarService, useValue: ocrSidecar },
        { provide: TranslationProviderRegistry, useValue: registry },
        { provide: TranslationService, useValue: translationService },
        { provide: TranslationCacheService, useValue: cacheService },
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
      },
    });
    expect(result).not.toHaveProperty('error');
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
      targetLang: 'en',
      providerHint: 'deepl',
    });
    expect(result).toEqual({ page });
    expect(result).not.toHaveProperty('error');
  });

  it('handleRunPipeline rejects an empty pageImagePath without invoking the service', async () => {
    const result = (await gateway.handleRunPipeline({
      pageImagePath: '',
      targetLang: 'en',
    })) as { page: PageTranslation; error: string };

    expect(translationService.runPipeline).not.toHaveBeenCalled();
    expect(result.page).toEqual({ pageHash: '', bubbles: [] });
    expect(result.error).toMatch(/pageImagePath/);
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
});
