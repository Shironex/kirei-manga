/**
 * Reading status for a series in the local library.
 */
export type ReadingStatus =
  | 'reading'
  | 'completed'
  | 'planToRead'
  | 'onHold'
  | 'dropped';

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
  localPath?: string;
  pageCount: number;
  isDownloaded: boolean;
  isRead: boolean;
  lastReadPage: number;
  readAt?: Date;
}

/**
 * A bookmark placed on a specific page of a chapter.
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
