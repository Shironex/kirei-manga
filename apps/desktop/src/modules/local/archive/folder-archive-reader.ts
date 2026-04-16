import * as fs from 'fs/promises';
import * as path from 'path';
import { lookup as mimeLookup } from 'mime-types';
import {
  type ArchiveReader,
  type PageEntry,
  getExtension,
  isImageEntry,
} from './archive-reader';
import { naturalPageSort } from './natural-sort';

/**
 * `ArchiveReader` over a directory of image files. Treats one flat level —
 * nested directories are skipped (the scanner produces one-level chapters
 * via its layout detection, so deeper nesting is someone else's concern).
 *
 * `PageEntry.name` is the bare filename (no directory prefix); `readPage`
 * re-joins it with the root — if a caller passes a name that would escape
 * the root (via `..`, absolute path, or embedded separator) we reject
 * rather than following it.
 */
export class FolderArchiveReader implements ArchiveReader {
  private knownEntries: Set<string> | null = null;

  constructor(private readonly rootPath: string) {}

  async listPages(): Promise<PageEntry[]> {
    const dirents = await fs.readdir(this.rootPath, { withFileTypes: true });
    const entries: PageEntry[] = [];
    const known = new Set<string>();

    for (const d of dirents) {
      if (!d.isFile()) continue;
      if (!isImageEntry(d.name)) continue;
      entries.push({ name: d.name, ext: getExtension(d.name) });
      known.add(d.name);
    }

    entries.sort((a, b) => naturalPageSort(a.name, b.name));
    this.knownEntries = known;
    return entries;
  }

  async readPage(entry: PageEntry): Promise<{ data: Buffer; mime: string }> {
    if (this.knownEntries && !this.knownEntries.has(entry.name)) {
      throw new Error(`folder-archive-reader: unknown entry ${entry.name}`);
    }
    if (entry.name.includes('/') || entry.name.includes('\\') || entry.name.includes('..')) {
      throw new Error(`folder-archive-reader: rejected suspicious entry ${entry.name}`);
    }
    const abs = path.join(this.rootPath, entry.name);
    const data = await fs.readFile(abs);
    const mime = mimeLookup(entry.ext) || 'application/octet-stream';
    return { data, mime };
  }

  async close(): Promise<void> {
    // Folder readers hold no handles — close is a no-op, but the interface
    // keeps the symmetry with zip readers so callers never branch.
  }
}
