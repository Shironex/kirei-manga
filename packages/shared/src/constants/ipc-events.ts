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
  GET_CHAPTER_STATES: 'library:get-chapter-states',
  CHECK_UPDATES: 'library:check-updates',
  MARK_SEEN: 'library:mark-seen',

  // Broadcasts
  UPDATED: 'library:updated',
  UPDATES_AVAILABLE: 'library:updates-available',
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
  ADD_BOOKMARK: 'chapter:add-bookmark',
  GET_BOOKMARKS: 'chapter:get-bookmarks',
  REMOVE_BOOKMARK: 'chapter:remove-bookmark',
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
// Reader Events (per-series reader preferences)
// ============================================
export const ReaderEvents = {
  SET_PREFS: 'reader:set-prefs',
  GET_PREFS: 'reader:get-prefs',
  UPDATE_PROGRESS: 'reader:update-progress',
  MARK_READ: 'reader:mark-read',
  SESSION_START: 'reader:session-start',
  SESSION_END: 'reader:session-end',
} as const;

// ============================================
// System Events
// ============================================
export const SystemEvents = {
  THROTTLED: 'system:throttled',
} as const;

// ============================================
// Settings Events
// ============================================
export const SettingsEvents = {
  GET: 'settings:get',
  SET: 'settings:set',
  RESET: 'settings:reset',

  // Broadcast to every connected renderer after SET / RESET so other windows
  // (and the same window's other tabs) re-apply settings reactively.
  UPDATED: 'settings:updated',
} as const;

// ============================================
// Library Cache Events (kirei-page disk cache)
// ============================================
export const LibraryCacheEvents = {
  GET_SIZE: 'library:get-cache-size',
  CLEAR: 'library:clear-cache',
} as const;
