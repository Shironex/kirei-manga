import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import {
  createLogger,
  TranslationEvents,
  type TranslationProviderStatusResponse,
} from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { BubbleDetectorService } from './bubble-detector.service';
import { OcrSidecarService } from './sidecar';

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

@WebSocketGateway({ cors: CORS_CONFIG })
@UseGuards(WsThrottlerGuard)
export class TranslationGateway {
  constructor(
    private readonly bubbleDetector: BubbleDetectorService,
    private readonly ocrSidecar: OcrSidecarService
    // Future: deepl: DeepLProvider, google: GoogleProvider, ollama: OllamaProvider (Slices E / I / J / K).
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
        const bd = this.bubbleDetector.getStatus();
        const oc = this.ocrSidecar.getStatus();
        return {
          // Providers come online in Slices E / I / J / K; empty for now.
          providers: [],
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
}
