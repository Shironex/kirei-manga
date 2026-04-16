import type { ReaderMode, ReaderDirection, FitMode } from './reader';
import type { LocalArchiveFormat } from './local';

/**
 * Reading status for a series in the local library.
 */
export type ReadingStatus = 'reading' | 'completed' | 'planToRead' | 'onHold' | 'dropped';

/**
 * Series source — where a series originated from.
 */
export type SeriesSource = 'local' | 'mangadex';

/**
 * A manga series tracked locally (may be MangaDex-backed).
 */
export interface Series {
  id: string;
  title: string;
  titleJapanese?: string;
  coverPath?: string;
  source: SeriesSource;
  mangadexId?: string;
  anilistId?: number;
  status: ReadingStatus;
  score?: number;
  notes?: string;
  addedAt: Date;
  lastReadAt?: Date;
  /** MangaDex chapter id of the most recent chapter the user touched. */
  lastChapterId?: string;
  /** Per-series reader layout mode. `undefined` = use `DEFAULT_READER_SETTINGS.mode`. */
  readerMode?: ReaderMode;
  /** Per-series page-turn direction. `undefined` = use `DEFAULT_READER_SETTINGS.direction`. */
  readerDirection?: ReaderDirection;
  /** Per-series page fit mode. `undefined` = use `DEFAULT_READER_SETTINGS.fit`. */
  readerFit?: FitMode;
  /** ISO timestamp of the last update check for this series. */
  lastCheckedAt?: Date;
  /** Number of new chapters found since the last time the user opened this series. */
  newChapterCount?: number;
  /**
   * Absolute path to the series' root folder (local-source only). Rescans
   * (Slice L) walk from this path. Undefined for MangaDex-source rows.
   */
  localRootPath?: string;
  /**
   * Dedup key for a local series — SHA1 of the sorted relative chapter paths
   * at import time. Lets the importer detect "this root is already imported"
   * without walking the filesystem again.
   */
  localContentHash?: string;
}

/**
 * A chapter belonging to a series.
 */
export interface Chapter {
  id: string;
  seriesId: string;
  title?: string;
  chapterNumber: number;
  volumeNumber?: number;
  source: SeriesSource;
  mangadexChapterId?: string;
  /** Absolute path for local chapters — directory for `folder`, archive file otherwise. */
  localPath?: string;
  /** On-disk format for local chapters. Undefined for MangaDex-source rows. */
  localArchiveFormat?: LocalArchiveFormat;
  pageCount: number;
  isDownloaded: boolean;
  isRead: boolean;
  lastReadPage: number;
  readAt?: Date;
}

/**
 * A bookmark placed on a specific page of a chapter. `chapterId` and
 * `seriesId` are LOCAL database ids — the renderer never holds these;
 * see `BookmarkWithChapter` for the hydrated shape used over IPC.
 */
export interface Bookmark {
  id: string;
  chapterId: string;
  seriesId: string;
  page: number;
  note?: string;
  createdAt: Date;
}

/**
 * Bookmark enriched with its source chapter's MangaDex identifiers and
 * display metadata (chapter / volume number, title). This is the shape the
 * renderer receives and caches — it can locate chapters by MangaDex id
 * without needing to resolve local ids.
 */
export interface BookmarkWithChapter extends Bookmark {
  mangadexChapterId: string;
  mangadexSeriesId: string;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
}

/**
 * A reading session — a contiguous span during which the user read a chapter.
 */
export interface ReadingSession {
  id: string;
  chapterId: string;
  startPage: number;
  endPage: number;
  startedAt: Date;
  endedAt?: Date;
  durationSeconds: number;
}

/**
 * Bounding box returned by the bubble detector.
 */
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
  confidence?: number;
}

/**
 * Translation cache entry keyed by page content hash and bubble index.
 */
export interface TranslationCache {
  id: string;
  pageHash: string;
  bubbleIndex: number;
  boundingBox: BoundingBox;
  originalText: string;
  translatedText: string;
  targetLanguage: string;
  provider: string;
  createdAt: Date;
}

/**
 * Notification that a followed series has new chapters available.
 */
export interface SeriesUpdate {
  seriesId: string;
  mangadexId?: string;
  newChapterCount: number;
  latestChapterNumber?: number;
  checkedAt: Date;
}
