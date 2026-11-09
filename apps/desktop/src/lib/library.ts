import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import type { SourceKind } from './reader';
import { utcOffsetMinutes } from './stats';

/** One OKLCH colour, mirrors `kirei_library::Oklch`. */
export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** The cover seed the theme is derived from, mirrors `kirei_library::Palette`. */
export interface Palette {
  h: number;
  c: number;
  /** Dark, mid, seed, second hue, light. */
  swatches: Oklch[];
  fallback: boolean;
}

export interface CoverRef {
  /** Content hash; the key `coverUrl` loads the thumbnail by. */
  hash: string;
  /** Absolute path of the thumbnail in the app data dir. Not loadable by the webview. */
  path: string;
  width: number;
  height: number;
  palette: Palette;
}

export interface LibraryRoot {
  id: number;
  path: string;
  addedAt: number;
  lastScanAt: number | null;
  seriesCount: number;
}

export interface SeriesSummary {
  id: number;
  rootId: number;
  title: string;
  path: string;
  cover: CoverRef | null;
  chapterCount: number;
  missingCount: number;
  completedCount: number;
  lastReadAt: number | null;
  /** Unread chapters added after the series was last read (0 if never read). */
  newCount: number;
  continueChapterId: number | null;
  missing: boolean;
  addedAt: number;
  updatedAt: number;
}

export interface ReadingProgress {
  chapterId: number;
  page: number;
  pageCount: number;
  completed: boolean;
  updatedAt: number;
}

export interface ChapterEntry {
  id: number;
  path: string;
  kind: SourceKind;
  title: string | null;
  volume: number | null;
  number: number | null;
  pageCount: number;
  language: string | null;
  scanGroup: string | null;
  missing: boolean;
  error: string | null;
  progress: ReadingProgress | null;
}

export interface SeriesDetail extends SeriesSummary {
  description: string | null;
  writer: string | null;
  year: number | null;
  language: string | null;
  genres: string[];
  /** ComicInfo `<Manga>`; `YesAndRightToLeft` means right to left. */
  manga: string | null;
  chapters: ChapterEntry[];
}

export type ScanPhase = 'discovering' | 'reading' | 'covers' | 'saving' | 'done';

export interface ScanProgress {
  phase: ScanPhase;
  root: string;
  done: number;
  total: number;
  current: string | null;
}

export interface ScanSummary {
  roots: number;
  series: number;
  chapters: number;
  added: number;
  updated: number;
  unchanged: number;
  missing: number;
  errors: number;
  coversMade: number;
  rootErrors: string[];
  elapsedMs: number;
}

/** Scheme serving thumbnails by hash, see `cover_protocol.rs`. */
export const COVER_SCHEME = 'kirei-cover';

/** URL the webview loads a cover thumbnail from. Takes the hash, never a path. */
export function coverUrl(cover: Pick<CoverRef, 'hash'>): string {
  return convertFileSrc(cover.hash, COVER_SCHEME);
}

export const SCAN_PROGRESS_EVENT = 'library:scan-progress';

export function listRoots(): Promise<LibraryRoot[]> {
  return invoke<LibraryRoot[]>('library_roots');
}

export function addRoot(path: string): Promise<LibraryRoot> {
  return invoke<LibraryRoot>('library_add_root', { path });
}

export function removeRoot(id: number): Promise<boolean> {
  return invoke<boolean>('library_remove_root', { id });
}

/** Scans one root, or every root when `rootId` is omitted. */
export function scanLibrary(rootId?: number): Promise<ScanSummary> {
  return invoke<ScanSummary>('library_scan', { rootId: rootId ?? null });
}

export function onScanProgress(handler: (progress: ScanProgress) => void): Promise<UnlistenFn> {
  return listen<ScanProgress>(SCAN_PROGRESS_EVENT, event => handler(event.payload));
}

export function listSeries(): Promise<SeriesSummary[]> {
  return invoke<SeriesSummary[]>('library_series');
}

export function getSeriesDetail(id: number): Promise<SeriesDetail | null> {
  return invoke<SeriesDetail | null>('library_series_detail', { id });
}

/**
 * Records the page on screen (0 based). The UTC offset files the event under
 * the right local day in the reading sessions behind the stats page.
 */
export function recordProgress(chapterId: number, page: number): Promise<ReadingProgress> {
  return invoke<ReadingProgress>('library_record_progress', {
    chapterId,
    page,
    utcOffsetMin: utcOffsetMinutes(),
  });
}

export function getSeriesSettings<T = unknown>(seriesId: number): Promise<T | null> {
  return invoke<T | null>('library_series_settings', { seriesId });
}

export function setSeriesSettings(seriesId: number, settings: unknown): Promise<void> {
  return invoke('library_set_series_settings', { seriesId, settings });
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

/** A short label such as `Vol. 2 Ch. 11`, falling back to the title. */
export function chapterLabel(chapter: Pick<ChapterEntry, 'volume' | 'number' | 'title'>): string {
  const parts: string[] = [];
  if (chapter.volume !== null) parts.push(`Vol. ${formatNumber(chapter.volume)}`);
  if (chapter.number !== null) parts.push(`Ch. ${formatNumber(chapter.number)}`);
  if (parts.length === 0) return chapter.title ?? 'Chapter';
  return parts.join(' ');
}
