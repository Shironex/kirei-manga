import { protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import {
  SAFE_SEGMENT,
  buildFreshResponse,
  getProtocolCacheDir,
  mimeForExt,
  parseSegments,
  serveCachedFile,
  writeAtomic,
} from '../shared/protocol-cache';
import type { MangaDexCoverSize } from '@kireimanga/shared';

const SCHEME = 'kirei-cover';
const CACHE_SUBDIR = 'covers';
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);

/**
 * Minimal surface we need from MangaDexClient. Declared structurally so the
 * protocol module doesn't pull Nest module graph into main/.
 */
export interface MangaDexCoverFetcher {
  fetchCoverImage(
    mangaId: string,
    fileName: string,
    size: MangaDexCoverSize
  ): Promise<{ buffer: Buffer; contentType: string }>;
}

let mangadexClient: MangaDexCoverFetcher | null = null;

function getCoverRoot(): string {
  return getProtocolCacheDir(CACHE_SUBDIR);
}

/**
 * Wire the MangaDex client into the protocol handler. Called from main/index.ts
 * after the Nest app has bootstrapped and the client instance is available.
 */
export function setMangaDexClient(client: MangaDexCoverFetcher): void {
  mangadexClient = client;
  logger.info('[kirei-cover] MangaDex client registered');
}

/** Build the URL renderer code uses for a MangaDex cover. */
export function toMangaDexCoverUrl(
  mangaId: string,
  fileName: string,
  size: MangaDexCoverSize = 512
): string {
  const suffix = size === 'original' ? '' : `.${size}.jpg`;
  return `${SCHEME}://mangadex/${mangaId}/${fileName}${suffix}`;
}

/** Legacy helper kept for callers storing pre-computed content-addressed files. */
export function toCoverUrl(fileName: string): string {
  return `${SCHEME}://local/${fileName}`;
}

interface ParsedMangaDexUrl {
  mangaId: string;
  fileName: string;
  size: MangaDexCoverSize;
}

/**
 * Parse URL shape: kirei-cover://mangadex/{mangaId}/{fileName}.{size}.jpg
 *                  kirei-cover://mangadex/{mangaId}/{fileName}           (original)
 */
function parseMangaDexUrl(pathname: string): ParsedMangaDexUrl | null {
  const stripped = pathname.replace(/^\/+/, '');
  const parts = stripped.split('/');
  if (parts.length !== 2) return null;
  const [mangaId, rest] = parts;
  if (!SAFE_SEGMENT.test(mangaId)) return null;

  // Size suffix is `.256.jpg` or `.512.jpg` — anything else is treated as original.
  const sizeMatch = rest.match(/^(.+?)\.(256|512)\.jpg$/);
  if (sizeMatch) {
    const fileName = sizeMatch[1];
    if (!SAFE_SEGMENT.test(fileName)) return null;
    return { mangaId, fileName, size: Number(sizeMatch[2]) as 256 | 512 };
  }
  if (!SAFE_SEGMENT.test(rest)) return null;
  return { mangaId, fileName: rest, size: 'original' };
}

function cachePathFor(parsed: ParsedMangaDexUrl): string {
  const sizeSuffix = parsed.size === 'original' ? '' : `.${parsed.size}.jpg`;
  return path.join(getCoverRoot(), 'mangadex', parsed.mangaId, `${parsed.fileName}${sizeSuffix}`);
}

interface ParsedLocalCoverUrl {
  seriesId: string;
  fileName: string;
  ext: string;
}

/**
 * Parse a local-cover URL. Mirror of the MangaDex parser, but the segment
 * sits below `local/{seriesId}/{fileName}.{ext}` so there's no size suffix
 * to strip. Returns `null` on a malformed path — logged as a 400 so the
 * cache directory never sees user-controlled bytes.
 */
function parseLocalCoverUrl(pathname: string): ParsedLocalCoverUrl | null {
  const parts = parseSegments(pathname, 2);
  if (!parts) return null;
  const [seriesId, fileName] = parts;
  const ext = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) return null;
  return { seriesId, fileName, ext };
}

/**
 * Serve a local cover from `userData/covers/local/{seriesId}/{file}`.
 * Local covers are extracted once at import time (see
 * `LocalLibraryService.import`), so a missing file means the user deleted
 * the cover on disk or the import failed — there's no fallback, return 404.
 */
async function serveLocalCover(pathname: string): Promise<Response> {
  const parsed = parseLocalCoverUrl(pathname);
  if (!parsed) {
    logger.warn(`[kirei-cover] Rejected malformed local URL: ${pathname}`);
    return new Response('Bad request', { status: 400 });
  }
  const filePath = path.join(getCoverRoot(), 'local', parsed.seriesId, parsed.fileName);
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size === 0) {
      return new Response('Not found', { status: 404 });
    }
    return await serveCachedFile(filePath, mimeForExt(parsed.ext));
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/**
 * Register the kirei-cover: protocol.
 *
 * URL shapes:
 *   kirei-cover://mangadex/{mangaId}/{fileName}.{size}.jpg   — proxied + cached
 *   kirei-cover://local/{seriesId}                            — reserved for v0.2 (404 for now)
 *
 * Security:
 *  - mangaId and fileName must match [a-zA-Z0-9._-]+ (no traversal, no unicode).
 *  - Only .jpg/.jpeg/.png/.webp/.gif/.bmp extensions served for local files.
 *  - Cached bytes live under userData/covers/mangadex/{mangaId}/ and are
 *    written atomically (.tmp + rename) to avoid serving torn files.
 */
export function registerKireiCoverProtocol(): void {
  getCoverRoot();

  protocol.handle(SCHEME, async request => {
    try {
      const url = new URL(request.url);
      const host = url.hostname;

      if (host === 'local') {
        return await serveLocalCover(url.pathname);
      }

      if (host !== 'mangadex') {
        return new Response('Unknown cover source', { status: 400 });
      }

      const parsed = parseMangaDexUrl(url.pathname);
      if (!parsed) {
        logger.warn(`[kirei-cover] Rejected malformed URL: ${request.url}`);
        return new Response('Bad request', { status: 400 });
      }

      const filePath = cachePathFor(parsed);
      const mime = mimeForExt('.jpg');

      try {
        const stat = await fs.promises.stat(filePath);
        if (stat.isFile() && stat.size > 0) {
          return await serveCachedFile(filePath, mime);
        }
      } catch {
        // miss — fall through to network fetch
      }

      if (!mangadexClient) {
        logger.warn('[kirei-cover] Cache miss but MangaDex client not wired yet');
        return new Response('Cover service not ready', { status: 503 });
      }

      let fetched;
      try {
        fetched = await mangadexClient.fetchCoverImage(
          parsed.mangaId,
          parsed.fileName,
          parsed.size
        );
      } catch (error) {
        logger.error(`[kirei-cover] Fetch failed for ${request.url}:`, error);
        return new Response('Upstream fetch failed', { status: 502 });
      }

      await writeAtomic(filePath, fetched.buffer);

      return buildFreshResponse(fetched.buffer, fetched.contentType || mime);
    } catch (error) {
      logger.error('[kirei-cover] Error handling request:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  logger.info('kirei-cover protocol registered');
}
