import { app, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import type { MangaDexCoverSize } from '@kireimanga/shared';

const SCHEME = 'kirei-cover';
const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']);
const SAFE_SEGMENT = /^[a-zA-Z0-9._-]+$/;

const EXT_TO_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

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

let coverRoot: string | null = null;
let mangadexClient: MangaDexCoverFetcher | null = null;

function getCoverRoot(): string {
  if (!coverRoot) {
    coverRoot = path.join(app.getPath('userData'), 'covers');
    if (!fs.existsSync(coverRoot)) {
      fs.mkdirSync(coverRoot, { recursive: true });
      logger.info(`Created covers directory: ${coverRoot}`);
    }
  }
  return coverRoot;
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
  const root = getCoverRoot();
  const sizeSuffix = parsed.size === 'original' ? '' : `.${parsed.size}.jpg`;
  return path.join(root, 'mangadex', parsed.mangaId, `${parsed.fileName}${sizeSuffix}`);
}

async function writeAtomic(filePath: string, data: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, filePath);
}

async function serveCachedFile(filePath: string, mime: string): Promise<Response> {
  const data = await fs.promises.readFile(filePath);
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
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
        // Reserved for v0.2 local library. Return 404 until implemented.
        return new Response('Not implemented', { status: 404 });
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
      const mime = EXT_TO_MIME['.jpg'];

      // Cache hit.
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

      return new Response(fetched.buffer, {
        status: 200,
        headers: {
          'Content-Type': fetched.contentType || mime,
          'Content-Length': String(fetched.buffer.byteLength),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch (error) {
      logger.error('[kirei-cover] Error handling request:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  // Referenced-but-unused guard: keep constants alive for future `local/` support.
  void ALLOWED_EXTENSIONS;

  logger.info('kirei-cover protocol registered');
}
