import { invoke } from '@tauri-apps/api/core';

/**
 * Housekeeping commands behind the Settings screen (src-tauri/src/settings.rs).
 * The setting values themselves go through `./store`.
 */

/** Mirrors `kirei_library::OrphanPurge`. */
export interface OrphanPurge {
  progress: number;
  settings: number;
}

/** Mirrors `kirei_library::CoverCacheUsage`. */
export interface CoverCacheUsage {
  bytes: number;
  files: number;
}

/** The fixed set of pages the app opens in the browser. */
export type ExternalLink = 'website' | 'repository' | 'issues' | 'notices';

/** Deletes progress and series settings left hidden by removed folders (all of them by default). */
export function purgeHiddenProgress(olderThanDays?: number): Promise<OrphanPurge> {
  return invoke<OrphanPurge>('library_purge_orphans', { olderThanDays: olderThanDays ?? null });
}

export function getCoverCache(): Promise<CoverCacheUsage> {
  return invoke<CoverCacheUsage>('library_cover_cache');
}

/** Deletes the cover thumbnails; scan afterwards to make them again. */
export function clearCoverCache(): Promise<CoverCacheUsage> {
  return invoke<CoverCacheUsage>('library_clear_cover_cache');
}

export function openDataDir(): Promise<void> {
  return invoke('open_data_dir');
}

export function openLink(link: ExternalLink): Promise<void> {
  return invoke('open_link', { link });
}

/** The bundled THIRD_PARTY_NOTICES text, or null when the build has none. */
export function getThirdPartyNotices(): Promise<string | null> {
  return invoke<string | null>('third_party_notices');
}
