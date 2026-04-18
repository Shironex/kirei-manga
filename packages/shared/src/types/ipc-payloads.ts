import type {
  Series,
  Chapter,
  ReadingStatus,
  BookmarkWithChapter,
  BoundingBox,
  SeriesUpdate,
} from './series';
import type { ReaderSettings } from './reader';
import type {
  MangaDexSeriesDetail,
  ChapterListItem,
  SearchFilters,
  SearchResult,
  OcrResult,
} from './mangadex';
import type {
  PageTranslation,
  TranslationProviderId,
  TranslationProviderStatus,
  TranslationSettings,
} from './translation';
import type { AppSettings, DeepPartial } from './settings';
import type {
  LocalSeriesMetaPatch,
  LocalChapterMetaPatch,
  ScanProgress,
  ScanResult,
  ScanCandidateSeries,
} from './local';

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
  isDownloaded: boolean;
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
  | 'prefs-changed'
  | 'bookmark-added'
  | 'bookmark-removed'
  | 'downloads-cleared';

/**
 * Payload broadcast on `LibraryEvents.UPDATED` after any library mutation.
 * `series` is populated for follow/status-changed; `id` for unfollow and
 * progress-changed (where the caller can re-fetch if it cares). `chapter`
 * rides along on `progress-changed` so renderer caches can patch without a
 * refetch. `bookmark` / `bookmarkId` ride along on bookmark-added /
 * bookmark-removed so renderer caches can patch in place.
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
  bookmark?: BookmarkWithChapter;
  bookmarkId?: string;
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

/**
 * Progress tick for a local chapter. `localSeriesId` and `localChapterId`
 * are SQLite primary keys (UUIDs) — no resolution step like the mangadex
 * flow needs. `pageCount` is supplied so the desktop can mark the chapter
 * read when `page >= pageCount - 1` without re-opening the archive.
 */
export interface ReaderUpdateLocalProgressPayload {
  localSeriesId: string;
  localChapterId: string;
  page: number;
  pageCount: number;
}

export interface ReaderUpdateLocalProgressResponse {
  success: boolean;
  isRead: boolean;
  error?: string;
}

/**
 * Resume request for a local chapter. Returns the last persisted
 * `lastReadPage` so the reader can open at the right page on next visit.
 * Zero when the chapter has never been read.
 */
export interface ReaderGetLocalResumePayload {
  localChapterId: string;
}

export interface ReaderGetLocalResumeResponse {
  startPage: number;
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
  total?: number;
  offset?: number;
  limit?: number;
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

export interface LibraryCheckUpdatesResponse {
  results: Array<{ seriesId: string; newCount: number }>;
  error?: string;
}

export interface LibraryMarkSeenPayload {
  seriesId: string;
}

export interface LibraryMarkSeenResponse {
  success: boolean;
  error?: string;
}

export interface LibraryUpdatesAvailableEvent {
  results: Array<{ seriesId: string; newCount: number }>;
}

// =============================================================================
// chapter:* payloads
// =============================================================================

export interface ChapterAddBookmarkPayload {
  mangadexSeriesId: string;
  mangadexChapterId: string;
  page: number;
  note?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
}

export interface ChapterAddBookmarkResponse {
  bookmark: BookmarkWithChapter | null;
  error?: string;
}

export interface ChapterGetBookmarksPayload {
  mangadexSeriesId: string;
}

export interface ChapterGetBookmarksResponse {
  bookmarks: BookmarkWithChapter[];
  error?: string;
}

export interface ChapterRemoveBookmarkPayload {
  bookmarkId: string;
}

export interface ChapterRemoveBookmarkResponse {
  success: boolean;
  error?: string;
}

// =============================================================================
// settings:* payloads
// =============================================================================

export interface SettingsGetResponse {
  settings: AppSettings;
  error?: string;
}

export interface SettingsSetPayload {
  /**
   * Partial settings patch — deep-merged into the existing AppSettings on the
   * desktop side. Sections not present are preserved as-is.
   */
  settings: DeepPartial<AppSettings>;
}

export interface SettingsSetResponse {
  settings: AppSettings;
  error?: string;
}

export interface SettingsUpdatedEvent {
  settings: AppSettings;
}

// =============================================================================
// library:* cache payloads (kirei-page disk cache)
// =============================================================================

export interface LibraryGetCacheSizeResponse {
  bytes: number;
  error?: string;
}

export interface LibraryClearCacheResponse {
  success: boolean;
  bytesFreed: number;
  /** Count of mangadex chapters whose `is_downloaded` flag was reset. */
  chaptersReset: number;
  error?: string;
}

// =============================================================================
// local:* payloads (v0.2 — local library import + reading)
// =============================================================================

export interface LocalPickFolderResponse {
  path: string | null;
  error?: string;
}

export interface LocalScanPayload {
  rootPath: string;
}

export interface LocalScanResponse {
  result: ScanResult | null;
  error?: string;
}

export interface LocalScanProgressEvent {
  progress: ScanProgress;
}

/**
 * User-confirmed subset of a prior scan. The desktop re-opens each candidate's
 * archive to extract the cover and compute the content hash; absolute paths
 * from the scan result are trusted unchanged.
 */
export interface LocalImportPayload {
  rootPath: string;
  candidates: ScanCandidateSeries[];
}

export interface LocalImportResponse {
  createdSeriesIds: string[];
  skipped: number;
  error?: string;
}

export interface LocalGetSeriesPayload {
  id: string;
}

export interface LocalGetSeriesResponse {
  series: Series | null;
  chapters: Chapter[];
  error?: string;
}

export interface LocalGetPagesPayload {
  localChapterId: string;
}

export interface LocalGetPagesResponse {
  pages: string[];
  error?: string;
}

export interface LocalUpdateSeriesPayload {
  id: string;
  patch: LocalSeriesMetaPatch;
}

export interface LocalUpdateSeriesResponse {
  series: Series | null;
  error?: string;
}

export interface LocalUpdateChapterPayload {
  chapterId: string;
  patch: LocalChapterMetaPatch;
}

export interface LocalUpdateChapterResponse {
  success: boolean;
  error?: string;
}

export interface LocalRescanSeriesPayload {
  id: string;
}

export interface LocalRescanSeriesResponse {
  newChapterCount: number;
  error?: string;
}

export interface LocalDeleteSeriesPayload {
  id: string;
}

export interface LocalDeleteSeriesResponse {
  success: boolean;
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

/**
 * Cache lookup keyed by page hash + target language + provider — exactly the
 * uniqueness tuple of a `translation_cache` row (Slice A.4 migration 007).
 */
export interface TranslationGetPagePayload {
  pageHash: string;
  targetLang: string;
  provider: TranslationProviderId;
}

export interface TranslationGetPageResponse {
  page: PageTranslation | null;
  error?: string;
}

/**
 * Primary entry point for the translation pipeline. `providerHint` is optional
 * — the registry resolves to `hint > default > any-healthy` (Slice E phase 3).
 *
 * Exactly one of `pageImagePath` / `pageUrl` must be provided. The renderer
 * usually only knows the `kirei-page://` URL of the displayed page; the
 * orchestrator resolves that URL to a filesystem path server-side via
 * `PageUrlResolverService` before hashing / cache lookup. Tests and other
 * code paths that already hold a real path can pass `pageImagePath` directly
 * to bypass resolution.
 */
export interface TranslationRunPipelinePayload {
  /** Filesystem path to the page image (preferred when known). */
  pageImagePath?: string;
  /**
   * `kirei-page://...` / `file://...` URL — or any absolute path — to be
   * resolved server-side. Mutually exclusive with `pageImagePath`.
   */
  pageUrl?: string;
  targetLang: string;
  providerHint?: TranslationProviderId;
}

/**
 * The orchestrator always returns a page result on success; pipeline failures
 * surface via the gateway-handler's `error` field rather than a null page.
 */
export interface TranslationRunPipelineResponse {
  page: PageTranslation;
  error?: string;
}

/**
 * Single round-trip status pull for the renderer's pipeline-health panel.
 * `providers` lists translation backends (DeepL / Google / Ollama / Tesseract —
 * empty until Slices E / I / J / K register concrete providers). `pipeline`
 * carries the desktop's pipeline-component statuses inline — kept here rather
 * than imported from desktop because `@kireimanga/shared` cannot depend on the
 * Electron app. Shapes are wire-compatible with the desktop's
 * `BubbleDetectorStatus` / `OcrSidecarStatus`; the gateway maps from concrete
 * types to this payload.
 */
export interface TranslationProviderStatusResponse {
  providers: TranslationProviderStatus[];
  pipeline: {
    bubbleDetector: { healthy: boolean; reason?: string };
    ocrSidecar: {
      state: 'not-downloaded' | 'downloading' | 'starting' | 'ready' | 'crashed' | 'unhealthy';
      reason?: string;
      modelLoaded?: boolean;
      downloadProgress?: { bytes: number; total: number };
    };
    /**
     * Slice K.2 — Tesseract OCR fallback used when the manga-ocr sidecar is
     * unhealthy. Optional for backward compatibility (older desktop builds
     * never populate it). The K.3 settings UI surfaces this as a secondary
     * row beneath `ocrSidecar` so the user can see when they're running on
     * the fallback. `name` is hard-coded for now; adding more fallback
     * backends would widen this to a discriminated union.
     */
    ocrFallback?: { name: 'tesseract'; healthy: boolean; reason?: string };
  };
  error?: string;
}

/**
 * Forward-compatible payload for Slice L. The `translation_flags` row schema
 * (migration 008) will mirror these fields.
 */
export interface TranslationReportBadPayload {
  pageHash: string;
  bubbleIndex: number;
  reason: string;
  userNote?: string;
}

export interface TranslationReportBadResponse {
  success: boolean;
  error?: string;
}

/**
 * Set or clear the per-series translation override (Slice H.2). Source-agnostic:
 * works for both `local` and `mangadex` rows. Pass `override: undefined` to
 * clear the override entirely (the series falls back to global settings on the
 * next pipeline invocation).
 *
 * Stored as JSON in `series.translation_override` — the resolution logic
 * (`global ∪ override`) ships with Slice H.3's pipeline-orchestrator wiring.
 */
export interface TranslationSetSeriesOverridePayload {
  seriesId: string;
  override: Partial<TranslationSettings> | undefined;
}

export interface TranslationSetSeriesOverrideResponse {
  series: Series | null;
  error?: string;
}
