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
  ChapterEvents,
  ReaderEvents,
  type LibraryGetSeriesPayload,
  type LibraryFollowPayload,
  type LibraryUnfollowPayload,
  type LibraryUpdateStatusPayload,
  type LibraryUpdateProgressPayload,
  type LibraryUpdatedEvent,
  type ChapterMarkReadPayload,
  type ChapterAddBookmarkPayload,
  type ChapterGetBookmarksPayload,
  type ReaderGetPrefsPayload,
  type ReaderSetPrefsPayload,
} from '@kireimanga/shared';
import { DEFAULT_READER_SETTINGS } from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { LibraryService } from './library.service';

const logger = createLogger('LibraryGateway');

@WebSocketGateway({ cors: CORS_CONFIG })
@UseGuards(WsThrottlerGuard)
export class LibraryGateway {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly libraryService: LibraryService) {
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

  @SubscribeMessage(LibraryEvents.UPDATE_PROGRESS)
  handleUpdateProgress(@MessageBody() payload: LibraryUpdateProgressPayload) {
    return handleGatewayRequest({
      logger,
      action: 'library:update-progress',
      defaultResult: { success: false },
      handler: async () => {
        await this.libraryService.updateProgress(payload.id, payload.chapterId, payload.page);
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'progress-changed',
          id: payload.id,
        } satisfies LibraryUpdatedEvent);
        return { success: true };
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
        const series = await this.libraryService.updateReaderPrefs(
          payload.seriesId,
          payload.prefs
        );
        this.server.emit(LibraryEvents.UPDATED, {
          action: 'prefs-changed',
          id: payload.seriesId,
          series: series ?? undefined,
        } satisfies LibraryUpdatedEvent);
        return { series };
      },
    });
  }

  @SubscribeMessage(ChapterEvents.MARK_READ)
  handleMarkRead(@MessageBody() payload: ChapterMarkReadPayload) {
    return handleGatewayRequest({
      logger,
      action: 'chapter:mark-read',
      defaultResult: { success: false },
      handler: async () => {
        await this.libraryService.markChapterRead(payload.chapterId);
        return { success: true };
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
        const bookmark = await this.libraryService.addBookmark(
          payload.chapterId,
          payload.page,
          payload.note
        );
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
        const bookmarks = await this.libraryService.getBookmarks(payload.chapterId);
        return { bookmarks };
      },
    });
  }
}
