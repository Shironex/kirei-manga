import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * Streaming SHA-256 of an image file. Returns 64-char lowercase hex.
 * Used as the page_hash key for translation_cache lookups.
 *
 * Streaming (not loadFile + hash) so 10MB+ pages don't spike memory.
 */
export async function pageHash(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath, { highWaterMark: 64 * 1024 });
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex');
}
