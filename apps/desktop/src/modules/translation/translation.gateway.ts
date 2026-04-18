import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import {
  createLogger,
  TranslationEvents,
  type TranslationGetPagePayload,
  type TranslationGetPageResponse,
  type TranslationProviderStatusResponse,
  type TranslationRunPipelinePayload,
  type TranslationRunPipelineResponse,
} from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { BubbleDetectorService } from './bubble-detector.service';
import { TranslationCacheService } from './cache';
import { TranslationProviderRegistry } from './providers';
import { OcrSidecarService } from './sidecar';
import { TranslationService } from './translation.service';

const logger = createLogger('TranslationGateway');

/**
 * Default `pipeline` block used as the gateway-handler fallback. Conservative
 * values so a thrown handler never makes the renderer believe a crashed
 * pipeline is healthy.
 */
const DEFAULT_PIPELINE: TranslationProviderStatusResponse['pipeline'] = {
  bubbleDetector: { healthy: false, reason: 'unknown' },
  ocrSidecar: { state: 'not-downloaded' },
};

/**
 * Empty `PageTranslation` returned as the `run-pipeline` fallback when the
 * orchestrator throws — keeps the wire shape stable so the renderer can rely
 * on `response.page.bubbles` always being an array even on failure.
 */
const EMPTY_PAGE: TranslationRunPipelineResponse['page'] = { pageHash: '', bubbles: [] };

@WebSocketGateway({ cors: CORS_CONFIG })
@UseGuards(WsThrottlerGuard)
export class TranslationGateway {
  constructor(
    private readonly bubbleDetector: BubbleDetectorService,
    private readonly ocrSidecar: OcrSidecarService,
    private readonly registry: TranslationProviderRegistry,
    private readonly translationService: TranslationService,
    private readonly cacheService: TranslationCacheService
    // Future: google / ollama land in the registry directly (Slices I / J / K).
  ) {
    logger.info('TranslationGateway initialized');
  }

  /** Snapshot every translation provider + pipeline component status in one round trip. */
  @SubscribeMessage(TranslationEvents.PROVIDER_STATUS)
  handleProviderStatus() {
    return handleGatewayRequest({
      logger,
      action: 'translation:provider-status',
      defaultResult: {
        providers: [],
        pipeline: DEFAULT_PIPELINE,
      } satisfies Pick<TranslationProviderStatusResponse, 'providers' | 'pipeline'>,
      handler: async (): Promise<TranslationProviderStatusResponse> => {
        const [providers, bd, oc] = await Promise.all([
          this.registry.getAllStatuses(),
          Promise.resolve(this.bubbleDetector.getStatus()),
          Promise.resolve(this.ocrSidecar.getStatus()),
        ]);
        return {
          providers,
          pipeline: {
            bubbleDetector: { healthy: bd.healthy, reason: bd.reason },
            ocrSidecar: {
              state: oc.state,
              reason: oc.reason,
              modelLoaded: oc.modelLoaded,
              downloadProgress: oc.downloadProgress,
            },
          },
        };
      },
    });
  }

  /** Run the full bubble-detect → OCR → translate pipeline for one page image. */
  @SubscribeMessage(TranslationEvents.RUN_PIPELINE)
  handleRunPipeline(@MessageBody() payload: TranslationRunPipelinePayload) {
    return handleGatewayRequest({
      logger,
      action: 'translation:run-pipeline',
      defaultResult: { page: EMPTY_PAGE } satisfies Pick<TranslationRunPipelineResponse, 'page'>,
      handler: async (): Promise<TranslationRunPipelineResponse> => {
        if (typeof payload?.pageImagePath !== 'string' || payload.pageImagePath.length === 0) {
          throw new Error('pageImagePath must be a non-empty string');
        }
        if (typeof payload.targetLang !== 'string' || payload.targetLang.length === 0) {
          throw new Error('targetLang must be a non-empty string');
        }
        const page = await this.translationService.runPipeline({
          pageImagePath: payload.pageImagePath,
          targetLang: payload.targetLang,
          providerHint: payload.providerHint,
        });
        return { page };
      },
    });
  }

  /** Cache-only lookup for the renderer's warm-cache reads (no pipeline kick-off). */
  @SubscribeMessage(TranslationEvents.GET_PAGE)
  handleGetPage(@MessageBody() payload: TranslationGetPagePayload) {
    return handleGatewayRequest({
      logger,
      action: 'translation:get-page',
      defaultResult: { page: null } satisfies Pick<TranslationGetPageResponse, 'page'>,
      handler: async (): Promise<TranslationGetPageResponse> => {
        if (typeof payload?.pageHash !== 'string' || payload.pageHash.length === 0) {
          throw new Error('pageHash must be a non-empty string');
        }
        if (typeof payload.targetLang !== 'string' || payload.targetLang.length === 0) {
          throw new Error('targetLang must be a non-empty string');
        }
        if (typeof payload.provider !== 'string') {
          throw new Error('provider must be a TranslationProviderId string');
        }
        const page = this.cacheService.getForPage(
          payload.pageHash,
          payload.targetLang,
          payload.provider
        );
        return { page };
      },
    });
  }
}
