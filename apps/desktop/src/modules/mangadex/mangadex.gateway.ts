import {
  WebSocketGateway,
  SubscribeMessage,
  MessageBody,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { UseGuards } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  createLogger,
  MangaDexEvents,
  type MangaDexSearchPayload,
  type MangaDexGetSeriesPayload,
  type MangaDexGetChaptersPayload,
  type MangaDexGetPagesPayload,
  type MangaDexDownloadChapterPayload,
} from '@kireimanga/shared';
import { CORS_CONFIG } from '../shared/cors.config';
import { WsThrottlerGuard } from '../shared/ws-throttler.guard';
import { handleGatewayRequest } from '../shared/gateway-handler';
import { MangaDexService } from './mangadex.service';
import { DatabaseService } from '../database';

const logger = createLogger('MangaDexGateway');

@WebSocketGateway({ cors: CORS_CONFIG })
@UseGuards(WsThrottlerGuard)
export class MangaDexGateway implements OnGatewayInit {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly mangadexService: MangaDexService,
    private readonly databaseService: DatabaseService
  ) {
    logger.info('MangaDexGateway initialized');
  }

  afterInit(server: Server): void {
    this.mangadexService.setServer(server);
  }

  @SubscribeMessage(MangaDexEvents.SEARCH)
  handleSearch(@MessageBody() payload: MangaDexSearchPayload) {
    return handleGatewayRequest({
      logger,
      action: 'mangadex:search',
      defaultResult: { results: [] },
      handler: async () => {
        const { results, total, offset, limit } = await this.mangadexService.search(
          payload.query,
          payload.filters
        );
        return { results, total, offset, limit };
      },
    });
  }

  @SubscribeMessage(MangaDexEvents.GET_SERIES)
  handleGetSeries(@MessageBody() payload: MangaDexGetSeriesPayload) {
    return handleGatewayRequest({
      logger,
      action: 'mangadex:get-series',
      defaultResult: { series: null },
      handler: async () => {
        const series = await this.mangadexService.getSeries(payload.mangadexId);
        return { series };
      },
    });
  }

  @SubscribeMessage(MangaDexEvents.GET_CHAPTERS)
  handleGetChapters(@MessageBody() payload: MangaDexGetChaptersPayload) {
    return handleGatewayRequest({
      logger,
      action: 'mangadex:get-chapters',
      defaultResult: { chapters: [] },
      handler: async () => {
        const chapters = await this.mangadexService.getChapters(payload.mangadexId, payload.lang);
        return { chapters };
      },
    });
  }

  @SubscribeMessage(MangaDexEvents.GET_PAGES)
  handleGetPages(@MessageBody() payload: MangaDexGetPagesPayload) {
    return handleGatewayRequest({
      logger,
      action: 'mangadex:get-pages',
      defaultResult: { pages: [] },
      handler: async () => {
        const pages = await this.mangadexService.getPages(payload.chapterId, payload.prefer);
        return { pages };
      },
    });
  }

  @SubscribeMessage(MangaDexEvents.DOWNLOAD_CHAPTER)
  handleDownloadChapter(@MessageBody() payload: MangaDexDownloadChapterPayload) {
    logger.info('mangadex:download-chapter (fire-and-forget)');
    this.mangadexService.downloadChapter(
      payload.chapterId,
      payload.mangadexSeriesId,
      this.databaseService
    );
    return { success: true };
  }

  @SubscribeMessage(MangaDexEvents.CHECK_UPDATES)
  handleCheckUpdates() {
    return handleGatewayRequest({
      logger,
      action: 'mangadex:check-updates',
      defaultResult: { updates: [] },
      handler: async () => {
        const results = await this.mangadexService.checkUpdates(this.databaseService);
        return { updates: results };
      },
    });
  }
}
