import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createLogger, LibraryEvents } from '@kireimanga/shared';
import type { LibraryUpdatesAvailableEvent } from '@kireimanga/shared';
import { MangaDexService } from '../mangadex/mangadex.service';
import { DatabaseService } from '../database';

const logger = createLogger('UpdatePollerService');

/** Base interval between background polls (6 hours). */
const POLL_BASE_MS = 6 * 60 * 60 * 1000;

/** Jitter applied to each poll interval: ±10 minutes, so concurrent installs stagger. */
const POLL_JITTER_MS = 10 * 60 * 1000;

/** Base delay before the first check after startup (10 seconds). */
const INITIAL_BASE_MS = 10_000;

/** Jitter applied to the initial delay: ±5 seconds. */
const INITIAL_JITTER_MS = 5_000;

function jitteredDelay(base: number, jitter: number): number {
  const offset = Math.round((Math.random() * 2 - 1) * jitter);
  return Math.max(0, base + offset);
}

/**
 * Best-effort online check. Returns `true` when we can't tell (e.g. Electron's
 * `net` module is unavailable in a test runtime) so the poll still runs rather
 * than being silently suppressed.
 */
function isOnline(): boolean {
  try {
    // Lazy require so test/non-Electron runtimes don't blow up at import time.
    const electron = require('electron') as { net?: { isOnline?: () => boolean } };
    if (electron?.net?.isOnline) {
      return electron.net.isOnline();
    }
  } catch {
    // fall through
  }
  return true;
}

/**
 * Background service that polls for new chapters on followed MangaDex series.
 * Runs the first check after a short startup delay (to let the WebSocket
 * server settle) and repeats roughly every 6 hours, with jitter so fleets of
 * installs don't hammer upstream on the same minute.
 */
@Injectable()
export class UpdatePollerService implements OnModuleInit, OnModuleDestroy {
  private cycleTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(
    private readonly mangadexService: MangaDexService,
    private readonly databaseService: DatabaseService
  ) {}

  onModuleInit(): void {
    const initialDelay = jitteredDelay(INITIAL_BASE_MS, INITIAL_JITTER_MS);
    logger.info(
      `Update poller starting — first check in ~${Math.round(initialDelay / 1000)}s, then every ~6h (±10m)`
    );
    this.scheduleNext(initialDelay);
  }

  onModuleDestroy(): void {
    this.destroyed = true;
    if (this.cycleTimer) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
    logger.info('Update poller stopped');
  }

  private scheduleNext(delayMs: number): void {
    if (this.destroyed) return;
    this.cycleTimer = setTimeout(() => {
      void this.runCycle();
    }, delayMs);
  }

  private async runCycle(): Promise<void> {
    this.cycleTimer = null;
    try {
      if (!isOnline()) {
        logger.debug('Skipping update check: offline');
      } else {
        await this.runCheckUpdates();
      }
    } finally {
      this.scheduleNext(jitteredDelay(POLL_BASE_MS, POLL_JITTER_MS));
    }
  }

  private async runCheckUpdates(): Promise<void> {
    try {
      logger.info('Running background update check...');
      const results = await this.mangadexService.checkUpdates(this.databaseService);

      const withUpdates = results.filter(r => r.newCount > 0);
      if (withUpdates.length > 0) {
        logger.info(`Background check found updates for ${withUpdates.length} series`);
      } else {
        logger.info('Background check complete — no new chapters');
      }

      const server = this.mangadexService.getServer();
      if (server) {
        server.emit(LibraryEvents.UPDATES_AVAILABLE, {
          results,
        } satisfies LibraryUpdatesAvailableEvent);
      }
    } catch (err) {
      // Per-series failures are logged inside MangaDexService.checkUpdates; this
      // catch only fires for a top-level failure (e.g. DB unavailable). Warn
      // rather than error so one bad cycle doesn't look catastrophic, and keep
      // swallowing so the poller survives to the next tick.
      logger.warn('Background update check cycle failed; will retry next interval:', err);
    }
  }
}
