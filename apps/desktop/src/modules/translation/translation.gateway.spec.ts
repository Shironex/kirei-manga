import { Test, type TestingModule } from '@nestjs/testing';
import { TranslationGateway } from './translation.gateway';
import { BubbleDetectorService } from './bubble-detector.service';
import { OcrSidecarService } from './sidecar';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';

/**
 * Unit-level coverage for the `translation:provider-status` channel. The
 * gateway is pure-mapping over the underlying services' `getStatus()` calls,
 * so we mock both and assert the wire-shape. The throttler guard is overridden
 * with a permissive stand-in — rate-limit behaviour is covered by the
 * dedicated `WsThrottlerGuard` suite.
 */
describe('TranslationGateway', () => {
  let module: TestingModule;
  let gateway: TranslationGateway;
  let bubbleDetector: { getStatus: jest.Mock };
  let ocrSidecar: { getStatus: jest.Mock };

  beforeEach(async () => {
    bubbleDetector = { getStatus: jest.fn() };
    ocrSidecar = { getStatus: jest.fn() };

    module = await Test.createTestingModule({
      providers: [
        TranslationGateway,
        { provide: BubbleDetectorService, useValue: bubbleDetector },
        { provide: OcrSidecarService, useValue: ocrSidecar },
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
});
