import type { Series, Chapter, ReadingStatus, Bookmark, BoundingBox, SeriesUpdate } from './series';
import type { MangaDexSeries, SearchFilters, SearchResult, OcrResult } from './mangadex';

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

export interface LibraryUpdateStatusPayload {
  id: string;
  status: ReadingStatus;
}

export interface LibraryUpdateStatusResponse {
  series: Series | null;
  error?: string;
}

export interface LibraryUpdateProgressPayload {
  id: string;
  chapterId: string;
  page: number;
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
  series: MangaDexSeries | null;
  error?: string;
}

export interface MangaDexGetChaptersPayload {
  mangadexId: string;
  lang?: string;
}

export interface MangaDexGetChaptersResponse {
  chapters: Chapter[];
  error?: string;
}

export interface MangaDexGetPagesPayload {
  chapterId: string;
}

export interface MangaDexGetPagesResponse {
  pages: string[];
  error?: string;
}

export interface MangaDexDownloadChapterPayload {
  chapterId: string;
}

export interface MangaDexCheckUpdatesResponse {
  updates: SeriesUpdate[];
  error?: string;
}

// =============================================================================
// chapter:* payloads
// =============================================================================

export interface ChapterMarkReadPayload {
  chapterId: string;
}

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
