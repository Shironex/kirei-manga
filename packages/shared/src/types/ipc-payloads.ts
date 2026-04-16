import type { Series, ReadingStatus, Bookmark, BoundingBox, SeriesUpdate } from './series';
import type { ReaderSettings } from './reader';
import type {
  MangaDexSeriesDetail,
  ChapterListItem,
  SearchFilters,
  SearchResult,
  OcrResult,
} from './mangadex';

// =============================================================================
// library:* payloads
// =============================================================================

export interface LibraryGetAllResponse {
  entries: Series[];
  error?: string;
}

export interface LibraryGetSeriesPayload {
  id: string;
}

export interface LibraryGetSeriesResponse {
  series: Series | null;
  error?: string;
}

export interface LibraryFollowPayload {
  mangadexId: string;
}

export interface LibraryFollowResponse {
  series: Series | null;
  error?: string;
}

export interface LibraryUnfollowPayload {
  id: string;
}

export interface LibraryUnfollowResponse {
  success: boolean;
  error?: string;
}

export interface LibraryUpdateStatusPayload {
  id: string;
  status: ReadingStatus;
}

export interface LibraryUpdateStatusResponse {
  series: Series | null;
  error?: string;
}

export interface LibraryGetChapterStatesPayload {
  seriesId: string;
  chapterIds: string[];
}

export interface LibraryChapterStatePatch {
  isRead: boolean;
  lastReadPage: number;
  pageCount: number;
}

export interface LibraryGetChapterStatesResponse {
  states: Record<string, LibraryChapterStatePatch>;
  error?: string;
}

/**
 * Discriminator for `LibraryUpdatedEvent` — which mutation triggered the
 * broadcast. The spec refers to this channel as `library:changed`; the
 * codebase keeps the existing `library:updated` constant.
 */
export type LibraryUpdatedAction =
  | 'followed'
  | 'unfollowed'
  | 'status-changed'
  | 'progress-changed'
  | 'prefs-changed';

/**
 * Payload broadcast on `LibraryEvents.UPDATED` after any library mutation.
 * `series` is populated for follow/status-changed; `id` for unfollow and
 * progress-changed (where the caller can re-fetch if it cares). `chapter`
 * rides along on `progress-changed` so renderer caches can patch without a
 * refetch.
 */
export interface LibraryUpdatedEvent {
  action: LibraryUpdatedAction;
  id?: string;
  series?: Series;
  chapter?: {
    mangadexChapterId: string;
    lastReadPage: number;
    isRead: boolean;
    pageCount: number;
  };
}

// =============================================================================
// reader:* payloads
// =============================================================================

export interface ReaderGetPrefsPayload {
  seriesId: string;
}

export interface ReaderGetPrefsResponse {
  prefs: ReaderSettings;
  error?: string;
}

export interface ReaderSetPrefsPayload {
  seriesId: string;
  prefs: Partial<ReaderSettings>;
}

export interface ReaderSetPrefsResponse {
  series: Series | null;
  error?: string;
}

export interface ReaderUpdateProgressPayload {
  mangadexSeriesId: string;
  mangadexChapterId: string;
  page: number;
  pageCount: number;
  chapterNumber?: number;
  volumeNumber?: number;
  title?: string;
}

export interface ReaderUpdateProgressResponse {
  success: boolean;
  isRead: boolean;
  error?: string;
}

export interface ReaderMarkReadPayload {
  mangadexSeriesId: string;
  mangadexChapterId: string;
  pageCount: number;
  chapterNumber?: number;
  volumeNumber?: number;
  title?: string;
}

export interface ReaderMarkReadResponse {
  success: boolean;
  error?: string;
}

export interface ReaderSessionStartPayload {
  mangadexSeriesId: string;
  mangadexChapterId: string;
}

export interface ReaderSessionStartResponse {
  sessionId: string;
  startPage: number;
  error?: string;
}

export interface ReaderSessionEndPayload {
  sessionId: string;
  endPage: number;
  durationMs: number;
}

export interface ReaderSessionEndResponse {
  success: boolean;
  error?: string;
}

// =============================================================================
// mangadex:* payloads
// =============================================================================

export interface MangaDexSearchPayload {
  query: string;
  filters?: SearchFilters;
}

export interface MangaDexSearchResponse {
  results: SearchResult[];
  error?: string;
}

export interface MangaDexGetSeriesPayload {
  mangadexId: string;
}

export interface MangaDexGetSeriesResponse {
  series: MangaDexSeriesDetail | null;
  error?: string;
}

export interface MangaDexGetChaptersPayload {
  mangadexId: string;
  lang?: string;
}

export interface MangaDexGetChaptersResponse {
  chapters: ChapterListItem[];
  error?: string;
}

export interface MangaDexGetPagesPayload {
  chapterId: string;
  /** Which mirror list to prefer. Defaults to `data` (full quality). */
  prefer?: 'data' | 'dataSaver';
}

export interface MangaDexGetPagesResponse {
  pages: string[];
  error?: string;
}

export interface MangaDexDownloadChapterPayload {
  chapterId: string;
  mangadexSeriesId: string;
}

export interface MangaDexDownloadProgressEvent {
  chapterId: string;
  current: number;
  total: number;
  status: 'downloading' | 'complete' | 'error';
  error?: string;
}

export interface MangaDexCheckUpdatesResponse {
  updates: SeriesUpdate[];
  error?: string;
}

// =============================================================================
// chapter:* payloads
// =============================================================================

export interface ChapterAddBookmarkPayload {
  chapterId: string;
  page: number;
  note?: string;
}

export interface ChapterGetBookmarksPayload {
  chapterId: string;
}

export interface ChapterGetBookmarksResponse {
  bookmarks: Bookmark[];
  error?: string;
}

// =============================================================================
// translation:* payloads (v0.3)
// =============================================================================

export interface TranslationDetectBubblesPayload {
  pageImagePath: string;
}

export interface TranslationDetectBubblesResponse {
  boxes: BoundingBox[];
  error?: string;
}

export interface TranslationOcrPagePayload {
  pageImagePath: string;
  boxes: BoundingBox[];
}

export interface TranslationOcrPageResponse {
  results: OcrResult[];
  error?: string;
}

export interface TranslationTranslatePayload {
  texts: string[];
  targetLang: string;
}

export interface TranslationTranslateResponse {
  translations: string[];
  error?: string;
}
