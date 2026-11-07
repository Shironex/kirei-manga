import { convertFileSrc, invoke } from '@tauri-apps/api/core';

export type SourceKind = 'zip' | 'rar' | 'folder';
export type ReadDirection = 'forward' | 'backward';

/** Mirrors `kirei_core::PageInfo`. */
export interface PageInfo {
  index: number;
  name: string;
  format: string;
  width: number | null;
  height: number | null;
  byteLen: number;
}

/** Mirrors `commands::OpenedSource`. */
export interface OpenedSource {
  id: number;
  kind: SourceKind;
  pages: PageInfo[];
  openMs: number;
}

/** Mirrors `commands::CacheStats`. */
export interface ReaderStats {
  hits: number;
  misses: number;
  prefetched: number;
  droppedStale: number;
  errors: number;
  cachedPages: number;
  cachedBytes: number;
  budgetBytes: number;
}

export const PAGE_SCHEME = 'kirei-page';

/** URL the webview loads a page from, served by the `kirei-page` protocol. */
export function pageUrl(sourceId: number, index: number): string {
  return convertFileSrc(`${sourceId}/${index}`, PAGE_SCHEME);
}

export function openSource(path: string): Promise<OpenedSource> {
  return invoke<OpenedSource>('open_source', { path });
}

export function focusPage(id: number, index: number, direction: ReadDirection): Promise<void> {
  return invoke('focus_page', { id, index, direction });
}

export function closeSource(id: number): Promise<void> {
  return invoke('close_source', { id });
}

export function readerStats(): Promise<ReaderStats> {
  return invoke<ReaderStats>('reader_stats');
}

/** Clamps a page step to the source and reports which way the reader moved. */
export function stepPage(
  current: number,
  delta: number,
  pageCount: number
): { index: number; direction: ReadDirection } {
  const index = Math.min(Math.max(current + delta, 0), Math.max(pageCount - 1, 0));
  return { index, direction: delta < 0 ? 'backward' : 'forward' };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
