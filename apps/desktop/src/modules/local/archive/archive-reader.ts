import type { LocalArchiveFormat } from '@kireimanga/shared';

/**
 * A single image entry inside an archive. `name` uniquely identifies the
 * entry within the archive and is what the reader hands back to `readPage`.
 * For folders it's the filename (no path prefix — directories are flattened
 * one level); for zips it's the archive-relative entry name.
 *
 * `ext` is the lower-cased extension without leading dot — downstream code
 * uses it for mime mapping without re-parsing the name.
 */
export interface PageEntry {
  name: string;
  ext: string;
}

/**
 * Unified view over a chapter's on-disk storage. Implementations handle one
 * `LocalArchiveFormat` each. The reader is stateful — callers must `close()`
 * after they're done, otherwise zip file handles leak on Windows.
 *
 * `listPages()` returns entries in natural reading order (see
 * `natural-sort.ts`). Implementations must only surface image entries and
 * drop everything else (thumbnails, info files, dotfiles, directories).
 */
export interface ArchiveReader {
  listPages(): Promise<PageEntry[]>;
  readPage(entry: PageEntry): Promise<{ data: Buffer; mime: string }>;
  close(): Promise<void>;
}

/**
 * Known image extensions the reader will surface. Anything else gets dropped
 * at `listPages` time. Kept case-insensitive by lower-casing upstream.
 */
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  'jpg',
  'jpeg',
  'png',
  'webp',
  'avif',
]);

/**
 * Lower-case filename extension without the leading dot. Returns `''` for
 * files with no extension. Handles `.jpg.bak` by returning the *last*
 * segment (`bak`), which is what the image-extension filter wants.
 */
export function getExtension(name: string): string {
  const idx = name.lastIndexOf('.');
  if (idx === -1 || idx === name.length - 1) return '';
  return name.slice(idx + 1).toLowerCase();
}

/**
 * Shared entry-name gate: drops directory suffixes, hidden dot-files, and
 * anything without a whitelisted image extension. Implementations funnel
 * their raw entry names through this before building `PageEntry`s.
 */
export function isImageEntry(name: string): boolean {
  if (!name || name.endsWith('/') || name.endsWith('\\')) return false;
  const base = name.split(/[\\/]/).pop() ?? '';
  if (!base || base.startsWith('.') || base.startsWith('_')) return false;
  return IMAGE_EXTENSIONS.has(getExtension(base));
}

/** Narrow helper — the union the factory discriminates on (Slice B.4). */
export type ArchiveReaderFormat = LocalArchiveFormat;
