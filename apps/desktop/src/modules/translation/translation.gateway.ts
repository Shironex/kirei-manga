import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import {
  createLogger,
  TranslationEvents,
  type Series,
  type TranslationEnsureReadyResponse,
  type TranslationGetPagePayload,
  type TranslationGetPageResponse,
  type TranslationProviderStatusResponse,
  type TranslationReportBadPayload,
  type TranslationReportBadResponse,
  type TranslationRunPipelinePayload,
  type TranslationRunPipelineResponse,
  type TranslationSetSeriesOverridePayload,
  type TranslationSetSeriesOverrideResponse,
  type TranslationSettings,
} from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { DatabaseService } from '../database';
import { BubbleDetectorService } from './bubble-detector.service';
import { TranslationCacheService } from './cache';
import { TranslationProviderRegistry } from './providers';
import { OcrBackendRegistry, OcrSidecarService } from './sidecar';
import { TranslationFlagsService } from './translation-flags.service';
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
    private readonly ocrBackends: OcrBackendRegistry,
    private readonly registry: TranslationProviderRegistry,
    private readonly translationService: TranslationService,
    private readonly cacheService: TranslationCacheService,
    private readonly database: DatabaseService,
    private readonly flagsService: TranslationFlagsService
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
        const [providers, bd, oc, fallback] = await Promise.all([
          this.registry.getAllStatuses(),
          Promise.resolve(this.bubbleDetector.getStatus()),
          Promise.resolve(this.ocrSidecar.getStatus()),
          Promise.resolve(this.ocrBackends.getFallbackStatus()),
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
            ocrFallback: fallback,
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
        const hasPath =
          typeof payload?.pageImagePath === 'string' && payload.pageImagePath.length > 0;
        const hasUrl = typeof payload?.pageUrl === 'string' && payload.pageUrl.length > 0;
        if (hasPath === hasUrl) {
          throw new Error(
            'exactly one of pageImagePath / pageUrl must be a non-empty string',
          );
        }
        if (typeof payload.targetLang !== 'string' || payload.targetLang.length === 0) {
          throw new Error('targetLang must be a non-empty string');
        }
        const page = await this.translationService.runPipeline({
          pageImagePath: hasPath ? payload.pageImagePath : undefined,
          pageUrl: hasUrl ? payload.pageUrl : undefined,
          targetLang: payload.targetLang,
          providerHint: payload.providerHint,
        });
        return { page };
      },
    });
  }

  /**
   * Persist a per-series translation override (Slice H.2). Source-agnostic —
   * works for both `local` and `mangadex` rows. `override === undefined` clears
   * the column so the series falls back to global settings on the next pipeline
   * invocation. The broader resolution logic (`global ∪ override` at pipeline
   * time) lands with Slice H.3 — this handler only owns the write path.
   */
  @SubscribeMessage(TranslationEvents.SET_SERIES_OVERRIDE)
  handleSetSeriesOverride(@MessageBody() payload: TranslationSetSeriesOverridePayload) {
    return handleGatewayRequest({
      logger,
      action: 'translation:set-series-override',
      defaultResult: { series: null } satisfies Pick<TranslationSetSeriesOverrideResponse, 'series'>,
      handler: async (): Promise<TranslationSetSeriesOverrideResponse> => {
        if (typeof payload?.seriesId !== 'string' || payload.seriesId.length === 0) {
          throw new Error('seriesId must be a non-empty string');
        }
        const json =
          payload.override === undefined ? null : JSON.stringify(payload.override);
        this.database.db
          .prepare('UPDATE series SET translation_override = ? WHERE id = ?')
          .run(json, payload.seriesId);

        const row = this.database.db
          .prepare(
            `SELECT id, title, title_japanese, cover_path, source, mangadex_id, status,
                    score, notes, added_at, last_read_at, last_chapter_id, last_checked_at,
                    new_chapter_count, local_root_path, local_content_hash, translation_override
             FROM series WHERE id = ?`
          )
          .get(payload.seriesId) as Record<string, unknown> | undefined;

        if (!row) return { series: null };

        const series: Series = {
          id: row.id as string,
          title: row.title as string,
          titleJapanese: (row.title_japanese as string | null) ?? undefined,
          coverPath: (row.cover_path as string | null) ?? undefined,
          source: row.source as Series['source'],
          mangadexId: (row.mangadex_id as string | null) ?? undefined,
          status: row.status as Series['status'],
          score: (row.score as number | null) ?? undefined,
          notes: (row.notes as string | null) ?? undefined,
          addedAt: new Date(row.added_at as string),
          lastReadAt: row.last_read_at ? new Date(row.last_read_at as string) : undefined,
          lastChapterId: (row.last_chapter_id as string | null) ?? undefined,
          lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at as string) : undefined,
          newChapterCount: (row.new_chapter_count as number | null) ?? undefined,
          localRootPath: (row.local_root_path as string | null) ?? undefined,
          localContentHash: (row.local_content_hash as string | null) ?? undefined,
          translationOverride: parseTranslationOverride(
            row.translation_override as string | null
          ),
        };

        return { series };
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

  /**
   * Renderer-triggered manual download / spawn for the OCR sidecar. Returns
   * immediately — the actual download streams in the background and progress
   * surfaces via the next `provider-status` poll under
   * `pipeline.ocrSidecar.downloadProgress`. Replaces the placeholder Download
   * button toast in the K.3 settings UI.
   */
  @SubscribeMessage(TranslationEvents.ENSURE_READY)
  handleEnsureReady() {
    return handleGatewayRequest({
      logger,
      action: 'translation:ensure-ready',
      defaultResult: { started: false } satisfies Pick<TranslationEnsureReadyResponse, 'started'>,
      handler: async (): Promise<TranslationEnsureReadyResponse> => {
        return this.ocrSidecar.kickReady();
      },
    });
  }

  /**
   * Slice L.3 — record a "this translation is wrong" report against a single
   * bubble. Validation lives in `TranslationFlagsService`; thrown errors are
   * surfaced via the gateway-handler envelope as `{ success: false, error }`.
   */
  @SubscribeMessage(TranslationEvents.REPORT_BAD)
  handleReportBad(@MessageBody() payload: TranslationReportBadPayload) {
    return handleGatewayRequest({
      logger,
      action: 'translation:report-bad',
      defaultResult: { success: false } satisfies Pick<TranslationReportBadResponse, 'success'>,
      handler: async (): Promise<TranslationReportBadResponse> => {
        return this.flagsService.flagBubble(payload);
      },
    });
  }
}

/**
 * Decode the JSON blob stored in `series.translation_override`. Defensive: a
 * malformed blob (manual edit, partial migration) collapses to `undefined`
 * rather than crashing the read — the series simply falls back to global
 * settings until the user re-saves the override.
 */
function parseTranslationOverride(
  raw: string | null
): Partial<TranslationSettings> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<TranslationSettings>;
    }
    return undefined;
  } catch {
    logger.warn('failed to parse translation_override JSON; ignoring');
    return undefined;
  }
}
