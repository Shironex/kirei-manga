import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Dirent } from 'fs';
import {
  createLogger,
  type LocalArchiveFormat,
  type ScanCandidateChapter,
  type ScanCandidateSeries,
  type ScanProgress,
  type ScanResult,
} from '@kireimanga/shared';
import { openArchive, inferArchiveFormat } from '../archive';
import { asyncPool } from './async-pool';
import { cleanTitle, parseChapterNumber, parseVolumeNumber } from './title-parse';

const logger = createLogger('LocalScannerService');

/**
 * Read-archive parallelism. 4 is a trade-off: higher numbers don't help
 * because archive open/list is I/O-bound against the same disk spindle on
 * most user systems, and going too wide starves the event loop for
 * everything else the main process has to do.
 */
const ARCHIVE_READ_CONCURRENCY = 4;

/**
 * Filenames the scanner always ignores. Normalized to lower-case before
 * matching so case-variant detritus (`.DS_STORE`) still gets dropped.
 */
const IGNORED_NAMES: ReadonlySet<string> = new Set([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  '@eadir',
]);

/** Prefixes we treat as hidden / system entries regardless of filename. */
function isHiddenPrefix(name: string): boolean {
  return name.startsWith('.') || name.startsWith('@');
}

function shouldIgnore(name: string): boolean {
  if (!name) return true;
  if (isHiddenPrefix(name)) return true;
  return IGNORED_NAMES.has(name.toLowerCase());
}

/**
 * Optional progress listener. Declared as a standalone type so the gateway
 * (Slice D.3) can debounce and re-emit; tests can verify phase ordering.
 */
export type ScanProgressListener = (progress: ScanProgress) => void;

interface DetectedChapter {
  absolutePath: string;
  relativePath: string;
  format: LocalArchiveFormat;
  /** Folder name or archive filename (without extension) — used by title-parse. */
  nameForParse: string;
}

interface DetectedSeries {
  absolutePath: string;
  folderName: string;
  chapters: DetectedChapter[];
}

interface ProbedChapter {
  candidate: ScanCandidateChapter;
  coverCandidatePath?: string;
}

/**
 * Read-only local scanner. Never writes to the DB or moves files — produces
 * a `ScanResult` the UI can review before the import step (Slice E) commits.
 * Keeps detection heuristics and archive probing split: walk first, then
 * open each chapter once to pull pageCount and cover-candidate.
 */
@Injectable()
export class LocalScannerService {
  /**
   * Scan `rootPath` and return a proposal of series + chapters to import.
   *
   * @param listener called with coarse progress updates; the gateway
   *   debounces before forwarding over the socket.
   */
  async scan(rootPath: string, listener?: ScanProgressListener): Promise<ScanResult> {
    const normalized = path.resolve(rootPath);

    listener?.({ phase: 'scanning', current: 0, total: 0, currentPath: normalized });

    const detected = await this.detectSeriesAndChapters(normalized, listener);

    const totalChapters = detected.reduce((acc, s) => acc + s.chapters.length, 0);
    let read = 0;
    listener?.({ phase: 'reading-archives', current: 0, total: totalChapters });

    const candidates: ScanCandidateSeries[] = [];
    for (const series of detected) {
      const chapters = await this.probeChapters(series.chapters, (archivePath) => {
        read += 1;
        listener?.({
          phase: 'reading-archives',
          current: read,
          total: totalChapters,
          currentPath: archivePath,
        });
      });
      if (chapters.length === 0) continue;

      candidates.push({
        absolutePath: series.absolutePath,
        suggestedTitle: cleanTitle(series.folderName) || series.folderName,
        coverCandidatePath: chapters[0].coverCandidatePath,
        chapters: chapters.map(c => c.candidate),
      });
    }

    listener?.({ phase: 'done', current: totalChapters, total: totalChapters });

    return {
      rootPath: normalized,
      scannedAt: new Date().toISOString(),
      candidates,
    };
  }

  /**
   * Targeted rescan for a single known series folder. Unlike `scan`, this
   * treats `seriesFolderPath` as the series directly — no root-level
   * layout detection. Used by the rescan flow (Slice L) to diff the
   * current on-disk chapter set against what SQLite knows about. Returns
   * `null` when the folder no longer exists or holds no readable
   * chapters.
   */
  async scanSeriesFolder(seriesFolderPath: string): Promise<ScanCandidateSeries | null> {
    const normalized = path.resolve(seriesFolderPath);
    const detected = await this.detectChaptersInSeries(normalized);
    if (detected.length === 0) return null;

    const probed = await this.probeChapters(detected, () => {
      /* no progress for single-folder rescans */
    });
    if (probed.length === 0) return null;

    return {
      absolutePath: normalized,
      suggestedTitle: cleanTitle(path.basename(normalized)) || path.basename(normalized),
      coverCandidatePath: probed[0].coverCandidatePath,
      chapters: probed.map(p => p.candidate),
    };
  }

  /**
   * Walk `rootPath` one or two levels deep to classify what kind of layout
   * the user has. The three supported shapes:
   *   - Single-series: root directly contains archive files → root = series.
   *   - Flat: each child folder contains archives/images → child = series.
   *   - Nested: child folder contains sub-folders whose children are images
   *     → child = series, sub-folders = chapters (volume-style layout).
   *
   * Mixed layouts aren't supported — the first check that matches wins.
   * Unknown files (PDF, text) are silently dropped so a user's `/manga`
   * root can contain README notes without poisoning the scan.
   */
  private async detectSeriesAndChapters(
    rootPath: string,
    listener?: ScanProgressListener
  ): Promise<DetectedSeries[]> {
    const rootEntries = await this.safeReadDir(rootPath);
    const rootFiles = rootEntries.filter(e => e.isFile() && !shouldIgnore(e.name));
    const rootDirs = rootEntries.filter(e => e.isDirectory() && !shouldIgnore(e.name));

    // Single-series layout: archives at the root, root itself is the series.
    const rootArchives = rootFiles
      .map(e => toChapter(rootPath, rootPath, e))
      .filter((c): c is DetectedChapter => c !== null);

    if (rootArchives.length > 0 && rootDirs.length === 0) {
      return [
        {
          absolutePath: rootPath,
          folderName: path.basename(rootPath),
          chapters: rootArchives,
        },
      ];
    }

    // For each child folder, inspect a level deeper to decide flat vs nested.
    const detected: DetectedSeries[] = [];
    let scanned = 0;
    for (const dirent of rootDirs) {
      scanned += 1;
      const seriesPath = path.join(rootPath, dirent.name);
      listener?.({
        phase: 'scanning',
        current: scanned,
        total: rootDirs.length,
        currentPath: seriesPath,
      });

      const chapters = await this.detectChaptersInSeries(seriesPath);
      if (chapters.length === 0) continue;
      detected.push({
        absolutePath: seriesPath,
        folderName: dirent.name,
        chapters,
      });
    }

    // Single-series with mixed neighbours: if root had archives *and* dirs,
    // treat the loose archives as their own series alongside the folder
    // detections. Keeps a root like `Root/Series A/` + `Root/OneShot.cbz`
    // intact.
    if (rootArchives.length > 0) {
      detected.push({
        absolutePath: rootPath,
        folderName: path.basename(rootPath),
        chapters: rootArchives,
      });
    }

    return detected;
  }

  /**
   * Decide whether `seriesPath` is a flat-series folder (archives directly
   * inside, or images directly inside = a single chapter), or a nested one
   * (sub-folders of images = per-chapter folders, volume-tree).
   */
  private async detectChaptersInSeries(seriesPath: string): Promise<DetectedChapter[]> {
    const entries = await this.safeReadDir(seriesPath);
    const files = entries.filter(e => e.isFile() && !shouldIgnore(e.name));
    const dirs = entries.filter(e => e.isDirectory() && !shouldIgnore(e.name));

    const archiveFiles = files
      .map(e => toChapter(seriesPath, seriesPath, e))
      .filter((c): c is DetectedChapter => c !== null);
    if (archiveFiles.length > 0) {
      return archiveFiles;
    }

    // Images directly at the series level → single-chapter series.
    const imageFiles = files.filter(e => isImageFile(e.name));
    if (imageFiles.length > 0) {
      return [
        {
          absolutePath: seriesPath,
          relativePath: '.',
          format: 'folder',
          nameForParse: path.basename(seriesPath),
        },
      ];
    }

    // Nested: sub-folders. Each sub-folder is a chapter (folder format) or
    // any archives inside it become chapters. We don't recurse deeper than
    // one level — volume-of-volumes is out of v0.2 scope.
    const chapters: DetectedChapter[] = [];
    for (const dirent of dirs) {
      const chapterPath = path.join(seriesPath, dirent.name);
      const innerEntries = await this.safeReadDir(chapterPath);
      const innerArchives = innerEntries
        .filter(e => e.isFile() && !shouldIgnore(e.name))
        .map(e => toChapter(seriesPath, chapterPath, e))
        .filter((c): c is DetectedChapter => c !== null);
      if (innerArchives.length > 0) {
        chapters.push(...innerArchives);
        continue;
      }

      const innerImages = innerEntries.filter(
        e => e.isFile() && !shouldIgnore(e.name) && isImageFile(e.name)
      );
      if (innerImages.length > 0) {
        chapters.push({
          absolutePath: chapterPath,
          relativePath: dirent.name,
          format: 'folder',
          nameForParse: dirent.name,
        });
      }
    }
    return chapters;
  }

  /**
   * Open each detected chapter, count pages, and pick the first image as a
   * cover candidate for the series. Runs at most
   * `ARCHIVE_READ_CONCURRENCY` opens in flight.
   */
  private async probeChapters(
    detected: readonly DetectedChapter[],
    onOne: (archivePath: string) => void
  ): Promise<Array<ProbedChapter>> {
    const results = await asyncPool<DetectedChapter, ProbedChapter | null>(
      ARCHIVE_READ_CONCURRENCY,
      detected,
      async c => {
      onOne(c.absolutePath);
      try {
        const reader = await openArchive(c.absolutePath, c.format);
        const pages = await reader.listPages();
        await reader.close();
        const candidate: ScanCandidateChapter = {
          relativePath: c.relativePath,
          chapterNumber: parseChapterNumber(c.nameForParse),
          volumeNumber: parseVolumeNumber(c.nameForParse),
          pageCount: pages.length,
          format: c.format,
        };
        const coverEntry = pages[0];
        // For folder chapters the first image is a real filesystem path the
        // importer can copy. For archive chapters we don't surface a cover
        // path — the importer re-opens the archive and reads the first page
        // directly (keeps the scan result filesystem-path-free for archives).
        const probed: ProbedChapter = { candidate };
        if (c.format === 'folder' && coverEntry) {
          probed.coverCandidatePath = path.join(c.absolutePath, coverEntry.name);
        }
        return probed;
      } catch (err) {
        logger.warn(
          `scanner: skipping unreadable chapter ${c.absolutePath}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        return null;
      }
      }
    );

    return results.filter((r): r is ProbedChapter => r !== null);
  }

  private async safeReadDir(p: string): Promise<Dirent[]> {
    try {
      return await fs.readdir(p, { withFileTypes: true });
    } catch (err) {
      logger.warn(
        `scanner: readdir failed for ${p}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return [];
    }
  }
}

const IMAGE_EXT_SET = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

function isImageFile(name: string): boolean {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return false;
  return IMAGE_EXT_SET.has(name.slice(idx + 1).toLowerCase());
}

/**
 * Convert a filesystem `Dirent` at `parent` into a `DetectedChapter`, or
 * `null` if the extension isn't a format we support. `seriesRoot` is the
 * path relative paths are computed against — the scanner keeps those paths
 * so the import step can persist them without re-walking.
 */
function toChapter(
  seriesRoot: string,
  parent: string,
  dirent: Dirent
): DetectedChapter | null {
  const abs = path.join(parent, dirent.name);
  const format = inferArchiveFormat(abs, dirent.isDirectory());
  if (!format || format === 'folder' || format === 'cbr') {
    // Folders are detected separately (nested layout); CBR is deferred.
    return null;
  }
  return {
    absolutePath: abs,
    relativePath: path.relative(seriesRoot, abs) || dirent.name,
    format,
    nameForParse: dirent.name.replace(/\.[^.]+$/, ''),
  };
}
