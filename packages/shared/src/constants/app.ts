/**
 * Application Constants for KireiManga.
 */

// =============================================================================
// App Identity
// =============================================================================

/** Application display name (includes Japanese title). */
export const APP_NAME = '綺麗漫画 · KireiManga';

/** Application ID used for packaging and OS-level registration. */
export const APP_ID = 'com.shironex.kireimanga';

// =============================================================================
// Network
// =============================================================================

/** Localhost address for the embedded NestJS backend. */
export const LOCALHOST = '127.0.0.1';

/** Vite dev server port for the renderer. */
export const VITE_DEV_PORT = 15175;

// =============================================================================
// Links
// =============================================================================

export const GITHUB_REPO_OWNER = 'Shironex';
export const GITHUB_REPO_NAME = 'kirei-manga';
export const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`;
export const GITHUB_RELEASES_API_URL = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases/latest`;

// =============================================================================
// Logging
// =============================================================================

export const LOG_FILE_PREFIX = 'kireimanga';
export const LOG_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const LOG_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const LOG_FLUSH_INTERVAL_MS = 100;
export const LOG_BUFFER_MAX_ENTRIES = 50;
export const LOG_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
