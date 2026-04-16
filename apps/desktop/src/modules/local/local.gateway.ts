import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server } from 'socket.io';
import { dialog } from 'electron';
import {
  createLogger,
  LibraryEvents,
  LocalEvents,
  ReaderEvents,
  type LocalDeleteSeriesPayload,
  type LocalGetPagesPayload,
  type LocalGetSeriesPayload,
  type LocalImportPayload,
  type LocalScanPayload,
  type LocalScanProgressEvent,
  type LocalUpdateChapterPayload,
  type LocalUpdateSeriesPayload,
  type LibraryUpdatedEvent,
  type ReaderGetLocalResumePayload,
  type ReaderUpdateLocalProgressPayload,
  type ScanProgress,
} from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { LocalScannerService } from './scanner';
import { LocalLibraryService } from './local-library.service';

const logger = createLogger('LocalGateway');

/** Smallest interval between SCAN_PROGRESS broadcasts. */
const SCAN_PROGRESS_DEBOUNCE_MS = 200;

@WebSocketGateway({ cors: CORS_CONFIG })
@UseGuards(WsThrottlerGuard)
export class LocalGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly scanner: LocalScannerService,
    private readonly library: LocalLibraryService
  ) {
    logger.info('LocalGateway initialized');
  }

  /**
   * Open the native folder picker and return the selected path. Runs in the
   * main process — `dialog.showOpenDialog` is a no-op under jest so this
   * handler is integration-tested via the import flow rather than a unit.
   */
  @SubscribeMessage(LocalEvents.PICK_FOLDER)
  handlePickFolder() {
    return handleGatewayRequest({
      logger,
      action: 'local:pick-folder',
      defaultResult: { path: null },
      handler: async () => {
        const result = await dialog.showOpenDialog({
          title: 'Select your manga folder',
          properties: ['openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return { path: null };
        }
        return { path: result.filePaths[0] };
      },
    });
  }

  /**
   * Run a scan and stream `SCAN_PROGRESS` events while it runs. The final
   * `ScanResult` is returned as the acknowledgement payload — the renderer
   * uses that for the import-review UI without needing to re-aggregate
   * progress events.
   */
  @SubscribeMessage(LocalEvents.SCAN)
  handleScan(@MessageBody() payload: LocalScanPayload) {
    return handleGatewayRequest({
      logger,
      action: 'local:scan',
      defaultResult: { result: null },
      handler: async () => {
        const emit = this.buildDebouncedEmitter();
        try {
          const result = await this.scanner.scan(payload.rootPath, emit.push);
          return { result };
        } finally {
          emit.flush();
        }
      },
    });
  }

  /**
   * Commit a user-confirmed scan proposal. Broadcasts one
   * `LibraryEvents.UPDATED` per newly-created series so the existing
   * library cache in the renderer refetches without needing to know
   * anything about local-specific channels.
   */
  @SubscribeMessage(LocalEvents.IMPORT)
  handleImport(@MessageBody() payload: LocalImportPayload) {
    return handleGatewayRequest({
      logger,
      action: 'local:import',
      defaultResult: { createdSeriesIds: [], skipped: 0 },
      handler: async () => {
        const result = await this.library.import(payload);
        for (const id of result.createdSeriesIds) {
          const series = await this.library.getSeries(id);
          this.server.emit(LibraryEvents.UPDATED, {
            action: 'followed',
            id,
            series: series ?? undefined,
          } satisfies LibraryUpdatedEvent);
        }
        return result;
      },
    });
  }

  @SubscribeMessage(LocalEvents.UPDATE_SERIES)
  handleUpdateSeries(@MessageBody() payload: LocalUpdateSeriesPayload) {
    return handleGatewayRequest({
      logger,
      action: 'local:update-series',
      defaultResult: { series: null },
      handler: async () => {
        const series = await this.library.updateSeries(payload.id, payload.patch);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'status-changed',
          id: payload.id,
          series: series ?? undefined,
        } satisfies LibraryUpdatedEvent);
        return { series };
      },
    });
  }

  @SubscribeMessage(LocalEvents.UPDATE_CHAPTER)
  handleUpdateChapter(@MessageBody() payload: LocalUpdateChapterPayload) {
    return handleGatewayRequest({
      logger,
      action: 'local:update-chapter',
      defaultResult: { success: false },
      handler: async () => {
        const success = await this.library.updateChapter(payload.chapterId, payload.patch);
        return { success };
      },
    });
  }

  /**
   * Read a local series + its chapters in one round trip. The renderer's
   * series-detail page asks for both at once so the layout can render in a
   * single pass.
   */
  @SubscribeMessage(LocalEvents.GET_SERIES)
  handleGetSeries(@MessageBody() payload: LocalGetSeriesPayload) {
    return handleGatewayRequest({
      logger,
      action: 'local:get-series',
      defaultResult: { series: null, chapters: [] },
      handler: async () => {
        const series = await this.library.getSeries(payload.id);
        if (!series) return { series: null, chapters: [] };
        const chapters = await this.library.getChaptersForRenderer(payload.id);
        return { series, chapters };
      },
    });
  }

  /**
   * Build the `kirei-page://local/` URL list the reader consumes. Each
   * URL's `pageIndex` is zero-based in the archive's listPages order, so
   * the protocol resolver returns the matching bytes without any extra
   * name lookup. Extensions preserve the source file's format so the
   * response's content-type is correct.
   */
  @SubscribeMessage(LocalEvents.GET_PAGES)
  handleGetPages(@MessageBody() payload: LocalGetPagesPayload) {
    return handleGatewayRequest({
      logger,
      action: 'local:get-pages',
      defaultResult: { pages: [] },
      handler: async () => {
        const entries = await this.library.listChapterPages(payload.localChapterId);
        if (!entries) return { pages: [] };
        const pages = entries.map(
          (entry, i) =>
            `kirei-page://local/${payload.localChapterId}/${i}.${entry.ext}`
        );
        return { pages };
      },
    });
  }

  /**
   * Persist a local reader progress tick. Broadcasts the library-updated
   * event so the library grid's "Continue" link refreshes to point at the
   * newly-read chapter. The payload shape intentionally mirrors the
   * mangadex counterpart so the renderer's store can reuse its
   * `progress-changed` branch unchanged.
   */
  @SubscribeMessage(ReaderEvents.UPDATE_LOCAL_PROGRESS)
  handleUpdateLocalProgress(@MessageBody() payload: ReaderUpdateLocalProgressPayload) {
    return handleGatewayRequest({
      logger,
      action: 'reader:update-local-progress',
      defaultResult: { success: false, isRead: false },
      handler: async () => {
        const { isRead } = await this.library.recordProgress(payload);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'progress-changed',
          id: payload.localSeriesId,
          chapter: {
            mangadexChapterId: payload.localChapterId,
            lastReadPage: payload.page,
            isRead,
            pageCount: payload.pageCount,
          },
        } satisfies LibraryUpdatedEvent);
        return { success: true, isRead };
      },
    });
  }

  @SubscribeMessage(ReaderEvents.GET_LOCAL_RESUME)
  handleGetLocalResume(@MessageBody() payload: ReaderGetLocalResumePayload) {
    return handleGatewayRequest({
      logger,
      action: 'reader:get-local-resume',
      defaultResult: { startPage: 0 },
      handler: async () => {
        const startPage = this.library.getChapterResumePage(payload.localChapterId);
        return { startPage };
      },
    });
  }

  /**
   * Rescan a followed series' root folder for newly-added chapters.
   * Broadcasts `library:updates-available` alongside a per-series
   * `library:updated` so badge counts and list ordering both refresh
   * immediately — the renderer keys the badge on `newChapterCount` and
   * refetches the series to pick up the new chapter rows.
   */
  @SubscribeMessage(LocalEvents.RESCAN_SERIES)
  handleRescanSeries(@MessageBody() payload: { id: string }) {
    return handleGatewayRequest({
      logger,
      action: 'local:rescan-series',
      defaultResult: { newChapterCount: 0 },
      handler: async () => {
        const result = await this.library.rescanSeries(payload.id);
        if (result.newChapterCount > 0) {
          const series = await this.library.getSeries(payload.id);
          this.server.emit(LibraryEvents.UPDATED, {
            action: 'status-changed',
            id: payload.id,
            series: series ?? undefined,
          } satisfies LibraryUpdatedEvent);
        }
        return result;
      },
    });
  }

  @SubscribeMessage(LocalEvents.DELETE_SERIES)
  handleDeleteSeries(@MessageBody() payload: LocalDeleteSeriesPayload) {
    return handleGatewayRequest({
      logger,
      action: 'local:delete-series',
      defaultResult: { success: false },
      handler: async () => {
        const success = await this.library.deleteSeries(payload.id);
        if (success) {
          this.server.emit(LibraryEvents.UPDATED, {
            action: 'unfollowed',
            id: payload.id,
          } satisfies LibraryUpdatedEvent);
        }
        return { success };
      },
    });
  }

  /**
   * Coalesce `ScanProgress` events so we never spam the socket more than
   * once per `SCAN_PROGRESS_DEBOUNCE_MS`. The last emitted event in a burst
   * is what the renderer cares about; intermediate ticks get dropped.
   * `flush` is idempotent — safe to call in a `finally` after the scan
   * resolves or throws.
   */
  private buildDebouncedEmitter(): {
    push: (progress: ScanProgress) => void;
    flush: () => void;
  } {
    let pending: ScanProgress | null = null;
    let lastEmit = 0;
    let timer: NodeJS.Timeout | null = null;

    const emit = (): void => {
      if (!pending) return;
      const event: LocalScanProgressEvent = { progress: pending };
      this.server.emit(LocalEvents.SCAN_PROGRESS, event);
      lastEmit = Date.now();
      pending = null;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    return {
      push: (progress: ScanProgress) => {
        pending = progress;
        const sinceLast = Date.now() - lastEmit;
        if (sinceLast >= SCAN_PROGRESS_DEBOUNCE_MS) {
          emit();
          return;
        }
        if (!timer) {
          timer = setTimeout(emit, SCAN_PROGRESS_DEBOUNCE_MS - sinceLast);
        }
      },
      flush: () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        emit();
      },
    };
  }
}
