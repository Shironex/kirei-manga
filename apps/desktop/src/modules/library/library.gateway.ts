import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  createLogger,
  LibraryEvents,
  LibraryCacheEvents,
  ChapterEvents,
  ReaderEvents,
  type LibraryGetSeriesPayload,
  type LibraryFollowPayload,
  type LibraryUnfollowPayload,
  type LibraryUpdateStatusPayload,
  type LibraryGetChapterStatesPayload,
  type LibraryUpdatedEvent,
  type LibraryMarkSeenPayload,
  type LibraryUpdatesAvailableEvent,
  type ChapterAddBookmarkPayload,
  type ChapterGetBookmarksPayload,
  type ChapterRemoveBookmarkPayload,
  type ReaderGetPrefsPayload,
  type ReaderSetPrefsPayload,
  type ReaderUpdateProgressPayload,
  type ReaderMarkReadPayload,
  type ReaderSessionStartPayload,
  type ReaderSessionEndPayload,
} from '@kireimanga/shared';
import { DEFAULT_READER_SETTINGS } from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { LibraryService } from './library.service';
import { BookmarkService } from './bookmark.service';
import { LibraryCacheService } from './library-cache.service';
import { MangaDexService } from '../mangadex/mangadex.service';
import { DatabaseService } from '../database';

const logger = createLogger('LibraryGateway');

@WebSocketGateway({ cors: CORS_CONFIG })
@UseGuards(WsThrottlerGuard)
export class LibraryGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly libraryService: LibraryService,
    private readonly bookmarkService: BookmarkService,
    private readonly libraryCacheService: LibraryCacheService,
    private readonly mangadexService: MangaDexService,
    private readonly databaseService: DatabaseService
  ) {
    logger.info('LibraryGateway initialized');
  }

  @SubscribeMessage(LibraryEvents.GET_ALL)
  handleGetAll() {
    return handleGatewayRequest({
      logger,
      action: 'library:get-all',
      defaultResult: { entries: [] },
      handler: async () => {
        const entries = await this.libraryService.getAll();
        return { entries };
      },
    });
  }

  @SubscribeMessage(LibraryEvents.GET_SERIES)
  handleGetSeries(@MessageBody() payload: LibraryGetSeriesPayload) {
    return handleGatewayRequest({
      logger,
      action: 'library:get-series',
      defaultResult: { series: null },
      handler: async () => {
        const series = await this.libraryService.getSeries(payload.id);
        return { series };
      },
    });
  }

  @SubscribeMessage(LibraryEvents.FOLLOW)
  handleFollow(@MessageBody() payload: LibraryFollowPayload) {
    return handleGatewayRequest({
      logger,
      action: 'library:follow',
      defaultResult: { series: null },
      handler: async () => {
        const series = await this.libraryService.follow(payload.mangadexId);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'followed',
          id: series.id,
          series,
        } satisfies LibraryUpdatedEvent);
        return { series };
      },
    });
  }

  @SubscribeMessage(LibraryEvents.UNFOLLOW)
  handleUnfollow(@MessageBody() payload: LibraryUnfollowPayload) {
    return handleGatewayRequest({
      logger,
      action: 'library:unfollow',
      defaultResult: { success: false },
      handler: async () => {
        await this.libraryService.unfollow(payload.id);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'unfollowed',
          id: payload.id,
        } satisfies LibraryUpdatedEvent);
        return { success: true };
      },
    });
  }

  @SubscribeMessage(LibraryEvents.UPDATE_STATUS)
  handleUpdateStatus(@MessageBody() payload: LibraryUpdateStatusPayload) {
    return handleGatewayRequest({
      logger,
      action: 'library:update-status',
      defaultResult: { series: null },
      handler: async () => {
        const series = await this.libraryService.updateStatus(payload.id, payload.status);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'status-changed',
          id: payload.id,
          series: series ?? undefined,
        } satisfies LibraryUpdatedEvent);
        return { series };
      },
    });
  }

  @SubscribeMessage(ReaderEvents.UPDATE_PROGRESS)
  handleUpdateProgress(@MessageBody() payload: ReaderUpdateProgressPayload) {
    return handleGatewayRequest({
      logger,
      action: 'reader:update-progress',
      defaultResult: { success: false, isRead: false },
      handler: async () => {
        const result = await this.libraryService.updateProgress(payload);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'progress-changed',
          id: result.localSeriesId,
          chapter: result.chapter,
        } satisfies LibraryUpdatedEvent);
        return { success: true, isRead: result.isRead };
      },
    });
  }

  @SubscribeMessage(ReaderEvents.MARK_READ)
  handleMarkRead(@MessageBody() payload: ReaderMarkReadPayload) {
    return handleGatewayRequest({
      logger,
      action: 'reader:mark-read',
      defaultResult: { success: false },
      handler: async () => {
        const result = await this.libraryService.markChapterRead(payload);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'progress-changed',
          id: result.localSeriesId,
          chapter: result.chapter,
        } satisfies LibraryUpdatedEvent);
        return { success: true };
      },
    });
  }

  @SubscribeMessage(LibraryEvents.GET_CHAPTER_STATES)
  handleGetChapterStates(@MessageBody() payload: LibraryGetChapterStatesPayload) {
    return handleGatewayRequest({
      logger,
      action: 'library:get-chapter-states',
      defaultResult: { states: {} },
      handler: async () => {
        const states = await this.libraryService.getChapterStates(
          payload.seriesId,
          payload.chapterIds
        );
        return { states };
      },
    });
  }

  @SubscribeMessage(ReaderEvents.SESSION_START)
  handleSessionStart(@MessageBody() payload: ReaderSessionStartPayload) {
    return handleGatewayRequest({
      logger,
      action: 'reader:session-start',
      defaultResult: { sessionId: '', startPage: 0 },
      handler: async () => {
        const result = await this.libraryService.startSession(payload);
        return result;
      },
    });
  }

  @SubscribeMessage(ReaderEvents.SESSION_END)
  handleSessionEnd(@MessageBody() payload: ReaderSessionEndPayload) {
    return handleGatewayRequest({
      logger,
      action: 'reader:session-end',
      defaultResult: { success: false },
      handler: async () => {
        const result = await this.libraryService.endSession(payload);
        return result;
      },
    });
  }

  @SubscribeMessage(ReaderEvents.GET_PREFS)
  handleGetReaderPrefs(@MessageBody() payload: ReaderGetPrefsPayload) {
    return handleGatewayRequest({
      logger,
      action: 'reader:get-prefs',
      defaultResult: { prefs: { ...DEFAULT_READER_SETTINGS } },
      handler: async () => {
        const prefs = await this.libraryService.getReaderPrefs(payload.seriesId);
        return { prefs };
      },
    });
  }

  @SubscribeMessage(ReaderEvents.SET_PREFS)
  handleSetReaderPrefs(@MessageBody() payload: ReaderSetPrefsPayload) {
    return handleGatewayRequest({
      logger,
      action: 'reader:set-prefs',
      defaultResult: { series: null },
      handler: async () => {
        const series = await this.libraryService.updateReaderPrefs(payload.seriesId, payload.prefs);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'prefs-changed',
          id: payload.seriesId,
          series: series ?? undefined,
        } satisfies LibraryUpdatedEvent);
        return { series };
      },
    });
  }

  @SubscribeMessage(ChapterEvents.ADD_BOOKMARK)
  handleAddBookmark(@MessageBody() payload: ChapterAddBookmarkPayload) {
    return handleGatewayRequest({
      logger,
      action: 'chapter:add-bookmark',
      defaultResult: { bookmark: null },
      handler: async () => {
        const bookmark = await this.bookmarkService.add(payload);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'bookmark-added',
          id: bookmark.seriesId,
          bookmark,
        } satisfies LibraryUpdatedEvent);
        return { bookmark };
      },
    });
  }

  @SubscribeMessage(ChapterEvents.GET_BOOKMARKS)
  handleGetBookmarks(@MessageBody() payload: ChapterGetBookmarksPayload) {
    return handleGatewayRequest({
      logger,
      action: 'chapter:get-bookmarks',
      defaultResult: { bookmarks: [] },
      handler: async () => {
        const bookmarks = await this.bookmarkService.getForSeries(payload.mangadexSeriesId);
        return { bookmarks };
      },
    });
  }

  @SubscribeMessage(ChapterEvents.REMOVE_BOOKMARK)
  handleRemoveBookmark(@MessageBody() payload: ChapterRemoveBookmarkPayload) {
    return handleGatewayRequest({
      logger,
      action: 'chapter:remove-bookmark',
      defaultResult: { success: false },
      handler: async () => {
        // Grab the local series id *before* the delete so the broadcast can
        // target listeners keyed on series. A missing row is not an error —
        // the service returns success=false and we skip the broadcast.
        const row = this.databaseService.db
          .prepare('SELECT series_id FROM bookmarks WHERE id = ?')
          .get(payload.bookmarkId) as { series_id: string } | undefined;

        const result = await this.bookmarkService.remove(payload.bookmarkId);
        if (result.success && row) {
          this.server.emit(LibraryEvents.UPDATED, {
            action: 'bookmark-removed',
            id: row.series_id,
            bookmarkId: payload.bookmarkId,
          } satisfies LibraryUpdatedEvent);
        }
        return { success: result.success };
      },
    });
  }

  @SubscribeMessage(LibraryEvents.CHECK_UPDATES)
  handleCheckUpdates() {
    return handleGatewayRequest({
      logger,
      action: 'library:check-updates',
      defaultResult: { results: [] },
      handler: async () => {
        const results = await this.mangadexService.checkUpdates(this.databaseService);
        this.server.emit(LibraryEvents.UPDATES_AVAILABLE, {
          results,
        } satisfies LibraryUpdatesAvailableEvent);
        return { results };
      },
    });
  }

  @SubscribeMessage(LibraryEvents.MARK_SEEN)
  handleMarkSeen(@MessageBody() payload: LibraryMarkSeenPayload) {
    return handleGatewayRequest({
      logger,
      action: 'library:mark-seen',
      defaultResult: { success: false },
      handler: async () => {
        await this.libraryService.markSeen(payload.seriesId);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'status-changed',
          id: payload.seriesId,
        } satisfies LibraryUpdatedEvent);
        return { success: true };
      },
    });
  }

  @SubscribeMessage(LibraryCacheEvents.GET_SIZE)
  handleGetCacheSize() {
    return handleGatewayRequest({
      logger,
      action: 'library:get-cache-size',
      defaultResult: { bytes: 0 },
      handler: async () => {
        const bytes = await this.libraryCacheService.getCacheSize();
        return { bytes };
      },
    });
  }

  @SubscribeMessage(LibraryCacheEvents.CLEAR)
  handleClearCache() {
    return handleGatewayRequest({
      logger,
      action: 'library:clear-cache',
      defaultResult: { success: false, bytesFreed: 0, chaptersReset: 0 },
      handler: async () => {
        const result = await this.libraryCacheService.clearCache();
        // Notify any open series-detail / library pages so the UI can drop
        // the "downloaded" checkmark without requiring a manual refresh.
        if (result.success && result.chaptersReset > 0) {
          this.server.emit(LibraryEvents.UPDATED, {
            action: 'downloads-cleared',
          } satisfies LibraryUpdatedEvent);
        }
        return result;
      },
    });
  }
}
