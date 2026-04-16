import StreamZip from 'node-stream-zip';
import { lookup as mimeLookup } from 'mime-types';
import { type ArchiveReader, type PageEntry, getExtension, isImageEntry } from './archive-reader';
import { naturalPageSort } from './natural-sort';

/**
 * `ArchiveReader` over a CBZ / ZIP file. Built on `node-stream-zip`'s async
 * API so entry reads don't block the event loop — the async handle holds
 * the archive open, so we must always `close()`.
 *
 * Listing + reading happen against entry *names* (archive-relative paths).
 * For nested archives (`chapter/001.jpg` vs top-level `001.jpg`), the reader
 * surfaces the full entry name; natural sort handles both layouts. Callers
 * that want only the display basename can split on `/` themselves.
 */
export class ZipArchiveReader implements ArchiveReader {
  private zip: StreamZip.StreamZipAsync;
  private entries: Map<string, PageEntry> | null = null;

  constructor(archivePath: string) {
    this.zip = new StreamZip.async({ file: archivePath });
  }

  async listPages(): Promise<PageEntry[]> {
    const raw = await this.zip.entries();
    const filtered: PageEntry[] = [];
    const index = new Map<string, PageEntry>();

    for (const entry of Object.values(raw)) {
      if (entry.isDirectory) continue;
      if (!isImageEntry(entry.name)) continue;

      const pageEntry: PageEntry = {
        name: entry.name,
        ext: getExtension(entry.name),
      };
      filtered.push(pageEntry);
      index.set(pageEntry.name, pageEntry);
    }

    filtered.sort((a, b) => naturalPageSort(a.name, b.name));
    this.entries = index;
    return filtered;
  }

  async readPage(entry: PageEntry): Promise<{ data: Buffer; mime: string }> {
    // Guard against callers passing a hand-built `PageEntry` whose name
    // wasn't surfaced by `listPages` — accepting arbitrary strings here is
    // how path-traversal sneaks in if this ever proxies user input.
    if (this.entries && !this.entries.has(entry.name)) {
      throw new Error(`zip-archive-reader: unknown entry ${entry.name}`);
    }
    const data = await this.zip.entryData(entry.name);
    const mime = mimeLookup(entry.ext) || 'application/octet-stream';
    return { data, mime };
  }

  async close(): Promise<void> {
    await this.zip.close();
  }
}
