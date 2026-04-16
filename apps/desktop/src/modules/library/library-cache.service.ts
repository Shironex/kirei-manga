import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { createLogger } from '@kireimanga/shared';
import { MangaDexClient } from '../mangadex/mangadex.client';

const logger = createLogger('LibraryCacheService');

/**
 * Resolve the on-disk cache root for chapter pages. Mirrors the path that
 * `MangaDexService.executeDownload` writes into. Falls back to `.userData/pages`
 * relative to cwd in non-Electron environments (Jest).
 */
function getPagesRoot(): string {
  try {
    return path.join(app.getPath('userData'), 'pages');
  } catch {
    return path.join(process.cwd(), '.userData', 'pages');
  }
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
 * Disk-cache management for the kirei-page chapter cache. Lives under
 * `userData/pages/mangadex/` — the same directory the page protocol reads
 * from and `MangaDexService.executeDownload` writes into.
 */
@Injectable()
export class LibraryCacheService {
  constructor(private readonly mangadexClient: MangaDexClient) {
    logger.info('LibraryCacheService initialized');
  }

  /** Total size in bytes of every cached chapter page across all sources. */
  async getCacheSize(): Promise<number> {
    const root = getPagesRoot();
    return dirSize(root);
  }

  /**
   * Wipe the cached chapter pages. Recreates the empty `pages/mangadex/` dir
   * so subsequent writes still land in the expected place, and drops the
   * in-memory at-home envelopes so the next read fetches fresh URLs.
   */
  async clearCache(): Promise<{ success: boolean; bytesFreed: number }> {
    const root = getPagesRoot();
    const bytesFreed = await dirSize(root);

    try {
      await fs.promises.rm(root, { recursive: true, force: true });
      // Recreate the mangadex subdir so MangaDexService.writeAtomic doesn't
      // need to mkdir the full chain on every page on the next download.
      await fs.promises.mkdir(path.join(root, 'mangadex'), { recursive: true });
      this.mangadexClient.invalidateAllAtHome();
      logger.info(`Cleared kirei-page cache (${bytesFreed} bytes)`);
      return { success: true, bytesFreed };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`clearCache failed: ${message}`);
      return { success: false, bytesFreed: 0 };
    }
  }
}
