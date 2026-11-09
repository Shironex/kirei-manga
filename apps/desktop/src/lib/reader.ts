import { convertFileSrc, invoke } from '@tauri-apps/api/core';

import type { ResampleFilter } from './settings/contract';

export type SourceKind = 'zip' | 'rar' | 'folder' | 'online';
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

/** Mirrors `commands::PageMeta`: a page with the size it is served at. */
export interface PageMeta extends PageInfo {
  servedWidth: number | null;
  servedHeight: number | null;
}

/** Mirrors `commands::SourcePages`. */
export interface SourcePages {
  revision: number;
  pages: PageMeta[];
}

/** Mirrors `commands::ViewportState`. */
export interface ViewportState {
  revision: number;
}

/** Mirrors `commands::Latency`, in microseconds over the recent window. */
export interface Latency {
  count: number;
  p50Us: number;
  p95Us: number;
  maxUs: number;
}

/** Mirrors `commands::CacheStats`. */
export interface ReaderStats {
  hits: number;
  misses: number;
  joined: number;
  prefetched: number;
  droppedStale: number;
  cancelled: number;
  errors: number;
  downscaled: number;
  original: number;
  decodeFallbacks: number;
  serve: Latency;
  render: Latency;
  cachedPages: number;
  cachedBytes: number;
  budgetBytes: number;
  revision: number;
}

export const PAGE_SCHEME = 'kirei-page';

/**
 * URL the webview loads a page from, served by the `kirei-page` protocol.
 * Pass the render revision from `setViewport` so a viewport change gives new
 * URLs and the webview fetches the resized pages instead of reusing old ones.
 * The protocol ignores the query; it only busts the webview's image cache.
 */
export function pageUrl(sourceId: number, index: number, revision?: number): string {
  const url = convertFileSrc(`${sourceId}/${index}`, PAGE_SCHEME);
  return revision === undefined ? url : `${url}?r=${revision}`;
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

/**
 * Sets the box pages are rendered into, in device pixels (CSS size times
 * `devicePixelRatio`). `null` leaves a side unbounded. Cheap to repeat: the
 * same box keeps the revision.
 */
export function setViewport(
  maxWidth: number | null,
  maxHeight: number | null
): Promise<ViewportState> {
  return invoke<ViewportState>('set_viewport', { maxWidth, maxHeight });
}

/**
 * Sets the resampling filter and the sharpening strength (0 to 100, 0 is off)
 * the pipeline renders pages with, and whether tall strips are fitted to the
 * box width so the paged modes can split them. Returns the render revision,
 * like `setViewport`; the same values again keep it.
 */
export function setRenderQuality(
  resample: ResampleFilter,
  sharpen: number,
  splitTall: boolean
): Promise<ViewportState> {
  return invoke<ViewportState>('set_render_quality', { resample, sharpen, splitTall });
}

/** Every page with its stored and served size, for layout before loading. */
export function pageMeta(id: number): Promise<SourcePages> {
  return invoke<SourcePages>('page_meta', { id });
}

/** Device pixel box for a CSS box, rounded up, never below one pixel. */
export function deviceBox(
  cssWidth: number,
  cssHeight: number,
  dpr: number
): { maxWidth: number; maxHeight: number } {
  const scale = dpr > 0 ? dpr : 1;
  return {
    maxWidth: Math.max(1, Math.ceil(cssWidth * scale)),
    maxHeight: Math.max(1, Math.ceil(cssHeight * scale)),
  };
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
