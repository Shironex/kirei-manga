import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { createLogger } from '@kireimanga/shared';
import { MangaDexClient } from '../mangadex/mangadex.client';
import { DatabaseService } from '../database';
import { pruneDiskCache, type DiskCacheBounds } from '../../main/shared/protocol-cache';

const logger = createLogger('LibraryCacheService');

// Why: pages cap sized for a generous offline reader (≈2000 pages at ~500 KiB
// each ≈ 1 GiB). Either ceiling triggers eviction, so very small archives can
// still cache a lot of pages and very large ones don't blow past 1 GiB.
const PAGE_CACHE_BOUNDS: DiskCacheBounds = {
  maxBytes: 1024 * 1024 * 1024,
  maxFiles: 2000,
};

// Why: cover cap is 1/4 of the pages cap. Covers are smaller (~30-80 KiB at
// .512.jpg) but hit rate is higher per-file because every library card + every
// search result caches one — 1000 files covers a very large library catalog.
const COVER_CACHE_BOUNDS: DiskCacheBounds = {
  maxBytes: 256 * 1024 * 1024,
  maxFiles: 1000,
};

// Why: sweep every hour. Writes accumulate at a modest pace (one file per page
// read or download), so an hourly sweep is responsive enough without beating
// the disk. An initial sweep runs shortly after boot to reclaim space carried
// over from previous sessions.
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const INITIAL_SWEEP_DELAY_MS = 30_000;

function resolveCacheRoot(subdir: string): string {
  try {
    return path.join(app.getPath('userData'), subdir);
  } catch {
    return path.join(process.cwd(), '.userData', subdir);
  }
}

/**
 * Resolve the on-disk cache root for chapter pages. Mirrors the path that
 * `MangaDexService.executeDownload` writes into. Falls back to `.userData/pages`
 * relative to cwd in non-Electron environments (Jest).
 */
function getPagesRoot(): string {
  return resolveCacheRoot('pages');
}

function getCoversRoot(): string {
  return resolveCacheRoot('covers');
}

/**
 * Recursively sum file sizes under `dir`. Returns 0 for missing directories.
 * Logs and continues on per-entry stat errors so a single permission glitch
 * never aborts a whole walk.
 */
async function dirSize(dir: string): Promise<number> {
  let total = 0;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return 0;
    logger.warn(`readdir failed for ${dir}: ${(err as Error).message}`);
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        total += await dirSize(full);
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(full);
        total += stat.size;
      }
    } catch (err) {
      logger.warn(`stat failed for ${full}: ${(err as Error).message}`);
    }
  }
  return total;
}

/**
 * Disk-cache management for the kirei-page chapter cache and kirei-cover
 * cover cache. Owns the periodic LRU sweep so the protocol handlers stay
 * thin — they only read/write, never decide what to evict.
 */
@Injectable()
export class LibraryCacheService implements OnModuleInit, OnModuleDestroy {
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly mangadexClient: MangaDexClient,
    private readonly databaseService: DatabaseService
  ) {
    logger.info('LibraryCacheService initialized');
  }

  onModuleInit(): void {
    this.initialTimer = setTimeout(() => {
      void this.sweep();
      this.sweepTimer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
      if (this.sweepTimer && typeof this.sweepTimer === 'object' && 'unref' in this.sweepTimer) {
        this.sweepTimer.unref();
      }
    }, INITIAL_SWEEP_DELAY_MS);
    if (this.initialTimer && typeof this.initialTimer === 'object' && 'unref' in this.initialTimer) {
      this.initialTimer.unref();
    }
  }

  onModuleDestroy(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  /** Total size in bytes of every cached chapter page across all sources. */
  async getCacheSize(): Promise<number> {
    return dirSize(getPagesRoot());
  }

  /**
   * Run one LRU sweep over both on-disk caches. Safe to call concurrently
   * with live protocol writes because eviction uses mtime (which `writeAtomic`
   * sets on the final rename, not on the .tmp staging file) and skips files
   * whose name contains `.tmp-` defensively.
   */
  async sweep(): Promise<void> {
    try {
      const pages = await pruneDiskCache(getPagesRoot(), PAGE_CACHE_BOUNDS);
      if (pages.filesRemoved > 0) {
        logger.info(
          `kirei-page LRU sweep: removed ${pages.filesRemoved} file(s), freed ${pages.bytesRemoved} bytes`
        );
      }
      const covers = await pruneDiskCache(getCoversRoot(), COVER_CACHE_BOUNDS);
      if (covers.filesRemoved > 0) {
        logger.info(
          `kirei-cover LRU sweep: removed ${covers.filesRemoved} file(s), freed ${covers.bytesRemoved} bytes`
        );
      }
    } catch (err) {
      logger.error(`Disk cache sweep failed: ${(err as Error).message}`);
    }
  }

  /**
   * Wipe the cached chapter pages. Recreates the empty `pages/mangadex/` dir
   * so subsequent writes still land in the expected place, drops the in-memory
   * at-home envelopes so the next read fetches fresh URLs, and resets the
   * `is_downloaded` flag for every MangaDex chapter (the bytes that flag
   * promised are gone — the next reader open will silently re-download and
   * re-set the flag).
   */
  async clearCache(): Promise<{
    success: boolean;
    bytesFreed: number;
    chaptersReset: number;
  }> {
    const root = getPagesRoot();
    const bytesFreed = await dirSize(root);

    try {
      await fs.promises.rm(root, { recursive: true, force: true });
      // Recreate the mangadex subdir so MangaDexService.writeAtomic doesn't
      // need to mkdir the full chain on every page on the next download.
      await fs.promises.mkdir(path.join(root, 'mangadex'), { recursive: true });
      this.mangadexClient.invalidateAllAtHome();

      // Reset the flag on every mangadex chapter that claimed offline bytes.
      // Local chapters keep their flag (bytes live outside the page cache).
      const result = this.databaseService.db
        .prepare(
          `UPDATE chapters SET is_downloaded = 0
             WHERE source = 'mangadex' AND is_downloaded = 1`
        )
        .run();
      const chaptersReset = Number(result.changes ?? 0);

      logger.info(
        `Cleared kirei-page cache (${bytesFreed} bytes, ${chaptersReset} chapter flag(s) reset)`
      );
      return { success: true, bytesFreed, chaptersReset };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`clearCache failed: ${message}`);
      return { success: false, bytesFreed: 0, chaptersReset: 0 };
    }
  }
}
