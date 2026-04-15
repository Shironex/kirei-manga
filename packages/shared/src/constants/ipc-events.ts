/**
 * WebSocket / IPC event name constants — single source of truth for every
 * channel between the Electron renderer and the embedded NestJS backend.
 *
 * Naming convention: 'domain:action' (colon separator).
 */

// ============================================
// Library Events (MangaDex-backed internal library)
// ============================================
export const LibraryEvents = {
  GET_ALL: 'library:get-all',
  GET_SERIES: 'library:get-series',
  FOLLOW: 'library:follow',
  UNFOLLOW: 'library:unfollow',
  UPDATE_STATUS: 'library:update-status',
  UPDATE_PROGRESS: 'library:update-progress',

  // Broadcasts
  UPDATED: 'library:updated',
} as const;

// ============================================
// MangaDex Events
// ============================================
export const MangaDexEvents = {
  SEARCH: 'mangadex:search',
  GET_SERIES: 'mangadex:get-series',
  GET_CHAPTERS: 'mangadex:get-chapters',
  GET_PAGES: 'mangadex:get-pages',
  DOWNLOAD_CHAPTER: 'mangadex:download-chapter',
  CHECK_UPDATES: 'mangadex:check-updates',

  // Broadcasts (download progress stream)
  DOWNLOAD_PROGRESS: 'mangadex:download-progress',
} as const;

// ============================================
// Chapter Events
// ============================================
export const ChapterEvents = {
  MARK_READ: 'chapter:mark-read',
  ADD_BOOKMARK: 'chapter:add-bookmark',
  GET_BOOKMARKS: 'chapter:get-bookmarks',
} as const;

// ============================================
// Translation Events (v0.3)
// ============================================
export const TranslationEvents = {
  DETECT_BUBBLES: 'translation:detect-bubbles',
  OCR_PAGE: 'translation:ocr-page',
  TRANSLATE: 'translation:translate',
  GET_CACHE: 'translation:get-cache',
} as const;

// ============================================
// System Events
// ============================================
export const SystemEvents = {
  THROTTLED: 'system:throttled',
} as const;
