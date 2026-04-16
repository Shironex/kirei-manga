import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';

/**
 * Shared primitives for the kirei-cover:/kirei-page: custom protocols.
 *
 * Centralises:
 *   - path-traversal guard (SAFE_SEGMENT)
 *   - atomic writes (.tmp + rename)
 *   - MIME resolution for image extensions
 *   - userData/<subdir> cache-root bootstrap
 *   - cache-hit Response builder
 *   - disk-cache LRU pruning keyed on mtime
 *
 * Keeping these in one place preserves identical behaviour across the two
 * protocol handlers and the MangaDex download path.
 */

/** Regex used to validate individual URL path segments. */
export const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

/** Lookup a content-type for a lowercased extension (including the dot). */
export function mimeForExt(ext: string): string {
  return EXT_TO_MIME[ext.toLowerCase()] ?? 'application/octet-stream';
}

/** Convenience: derive the extension from a filename and resolve its MIME. */
export function mimeForFile(fileName: string): string {
  return mimeForExt(path.extname(fileName));
}

/**
 * Validate every segment of a URL pathname against SAFE_SEGMENT and return
 * the parts, or `null` if the shape is unexpected or any segment is unsafe.
 * The pathname is stripped of leading slashes first.
 */
export function parseSegments(pathname: string, expectedCount: number): string[] | null {
  const stripped = pathname.replace(/^\/+/, '');
  const parts = stripped.split('/');
  if (parts.length !== expectedCount) return null;
  for (const part of parts) {
    if (!SAFE_SEGMENT.test(part)) return null;
  }
  return parts;
}

const cacheRoots = new Map<string, string>();

/**
 * Resolve (and lazily create) `userData/<subdir>`. Results are memoised per
 * subdir so repeated calls are effectively free.
 */
export function getProtocolCacheDir(subdir: string): string {
  const cached = cacheRoots.get(subdir);
  if (cached) return cached;
  const root = path.join(app.getPath('userData'), subdir);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
    logger.info(`Created ${subdir} directory: ${root}`);
  }
  cacheRoots.set(subdir, root);
  return root;
}

/**
 * Write `data` to `filePath` atomically: write a sibling `.tmp` and rename
 * into place so concurrent readers never observe a torn file. Parent
 * directories are created on demand.
 */
export async function writeAtomic(filePath: string, data: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, filePath);
}

const IMMUTABLE_HEADERS = {
  'Cache-Control': 'public, max-age=31536000, immutable',
} as const;

/**
 * Read the cached file and wrap it in a 200 Response with long-lived
 * immutable cache headers. Callers should have verified the file exists and
 * is non-empty.
 */
export async function serveCachedFile(filePath: string, mime: string): Promise<Response> {
  const data = await fs.promises.readFile(filePath);
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.byteLength),
      ...IMMUTABLE_HEADERS,
    },
  });
}

/**
 * Build a 200 Response for freshly-fetched bytes using the same immutable
 * cache headers as the disk-cache path.
 */
export function buildFreshResponse(buffer: Buffer, mime: string): Response {
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(buffer.byteLength),
      ...IMMUTABLE_HEADERS,
    },
  });
}

interface FileEntry {
  path: string;
  size: number;
  mtimeMs: number;
}

async function collectFiles(dir: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return out;
    logger.warn(`[protocol-cache] readdir failed for ${dir}: ${(err as Error).message}`);
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    // Skip our own in-flight .tmp-* staging files so we never delete a
    // sibling write another handler is mid-rename on.
    if (entry.isFile() && entry.name.includes('.tmp-')) continue;
    try {
      if (entry.isDirectory()) {
        const nested = await collectFiles(full);
        out.push(...nested);
      } else if (entry.isFile()) {
        const stat = await fs.promises.stat(full);
        out.push({ path: full, size: stat.size, mtimeMs: stat.mtimeMs });
      }
    } catch (err) {
      logger.warn(`[protocol-cache] stat failed for ${full}: ${(err as Error).message}`);
    }
  }
  return out;
}

async function tryUnlink(filePath: string): Promise<number> {
  try {
    const stat = await fs.promises.stat(filePath);
    await fs.promises.unlink(filePath);
    return stat.size;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') {
      logger.warn(`[protocol-cache] unlink failed for ${filePath}: ${(err as Error).message}`);
    }
    return 0;
  }
}

export interface DiskCacheBounds {
  /** Maximum total size in bytes before LRU eviction kicks in. */
  maxBytes: number;
  /** Maximum total file count before LRU eviction kicks in. */
  maxFiles: number;
}

export interface PruneResult {
  filesBefore: number;
  filesRemoved: number;
  bytesBefore: number;
  bytesRemoved: number;
}

/**
 * Prune a disk cache by deleting the oldest files (by mtime) until both
 * `maxBytes` and `maxFiles` caps are satisfied. Missing roots are a no-op.
 *
 * Uses mtime (not atime) because atime updates are frequently disabled on
 * modern filesystems and are unreliable during concurrent reads; mtime is
 * stable and updated on each atomic rename from `writeAtomic`, which is the
 * only write path into these caches.
 */
export async function pruneDiskCache(
  root: string,
  bounds: DiskCacheBounds
): Promise<PruneResult> {
  const files = await collectFiles(root);
  const filesBefore = files.length;
  const bytesBefore = files.reduce((n, f) => n + f.size, 0);

  if (filesBefore <= bounds.maxFiles && bytesBefore <= bounds.maxBytes) {
    return { filesBefore, filesRemoved: 0, bytesBefore, bytesRemoved: 0 };
  }

  files.sort((a, b) => a.mtimeMs - b.mtimeMs);

  let runningFiles = filesBefore;
  let runningBytes = bytesBefore;
  let filesRemoved = 0;
  let bytesRemoved = 0;

  for (const file of files) {
    if (runningFiles <= bounds.maxFiles && runningBytes <= bounds.maxBytes) break;
    const freed = await tryUnlink(file.path);
    if (freed > 0) {
      runningBytes -= freed;
      bytesRemoved += freed;
    } else {
      runningBytes -= file.size;
    }
    runningFiles -= 1;
    filesRemoved += 1;
  }

  return { filesBefore, filesRemoved, bytesBefore, bytesRemoved };
}
