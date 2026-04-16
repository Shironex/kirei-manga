import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createLogger, LibraryEvents } from '@kireimanga/shared';
import type { LibraryUpdatesAvailableEvent } from '@kireimanga/shared';
import { MangaDexService } from '../mangadex/mangadex.service';
import { DatabaseService } from '../database';

const logger = createLogger('UpdatePollerService');

/** How often to poll for updates (6 hours). */
const POLL_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Delay before the first check after startup (10 seconds). */
const INITIAL_DELAY_MS = 10_000;

/**
 * Background service that polls for new chapters on followed MangaDex series.
 * Runs the first check after a short startup delay (to let the WebSocket
 * server settle) and repeats every 6 hours.
 */
@Injectable()
export class UpdatePollerService implements OnModuleInit, OnModuleDestroy {
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly mangadexService: MangaDexService,
    private readonly databaseService: DatabaseService,
  ) {}

  onModuleInit(): void {
    logger.info('Update poller starting — first check in 10s, then every 6h');

    this.initialTimer = setTimeout(() => {
      this.runCheckUpdates();
      this.intervalTimer = setInterval(
        () => this.runCheckUpdates(),
        POLL_INTERVAL_MS,
      );
    }, INITIAL_DELAY_MS);
  }

  onModuleDestroy(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    logger.info('Update poller stopped');
  }

  private async runCheckUpdates(): Promise<void> {
    try {
      logger.info('Running background update check...');
      const results = await this.mangadexService.checkUpdates(this.databaseService);

      const withUpdates = results.filter(r => r.newCount > 0);
      if (withUpdates.length > 0) {
        logger.info(
          `Background check found updates for ${withUpdates.length} series`,
        );
      } else {
        logger.info('Background check complete — no new chapters');
      }

      // Broadcast to connected clients so the renderer can refresh badges.
      const server = this.mangadexService.getServer();
      if (server) {
        server.emit(LibraryEvents.UPDATES_AVAILABLE, {
          results,
        } satisfies LibraryUpdatesAvailableEvent);
      }
    } catch (err) {
      logger.error('Background update check failed:', err);
    }
  }
}
