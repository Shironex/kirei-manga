import { app, protocol } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logger';
import type { MangaDexAtHomeResponse } from '@kireimanga/shared';

const SCHEME = 'kirei-page';
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
 * protocol module doesn't pull the Nest module graph into main/.
 */
export interface MangaDexPageFetcher {
  getCachedAtHome(chapterId: string): MangaDexAtHomeResponse | null;
  getChapterPages(chapterId: string): Promise<MangaDexAtHomeResponse>;
  invalidateAtHome(chapterId: string): void;
  fetchPageImage(url: string): Promise<{
    ok: boolean;
    status: number;
    buffer: Buffer;
    contentType: string;
  }>;
}

/**
 * Minimal surface we need from `LocalLibraryService` to serve
 * `kirei-page://local/` requests. Matches the public signatures exactly so
 * the Nest service can be passed in unchanged from main/index.ts.
 */
export interface LocalPageFetcher {
  readChapterPage(
    chapterId: string,
    pageIndex: number
  ): Promise<{ data: Buffer; mime: string } | null>;
}

let pagesRoot: string | null = null;
let mangadexClient: MangaDexPageFetcher | null = null;
let localFetcher: LocalPageFetcher | null = null;

function getPagesRoot(): string {
  if (!pagesRoot) {
    pagesRoot = path.join(app.getPath('userData'), 'pages');
    if (!fs.existsSync(pagesRoot)) {
      fs.mkdirSync(pagesRoot, { recursive: true });
      logger.info(`Created pages directory: ${pagesRoot}`);
    }
  }
  return pagesRoot;
}

/**
 * Wire the MangaDex client into the protocol handler. Called from main/index.ts
 * after the Nest app has bootstrapped.
 */
export function setMangaDexClient(client: MangaDexPageFetcher): void {
  mangadexClient = client;
  logger.info('[kirei-page] MangaDex client registered');
}

/**
 * Wire `LocalLibraryService` into the local branch of the protocol. Called
 * alongside `setMangaDexClient` after Nest boot — the local branch is
 * unavailable until this runs.
 */
export function setLocalPageFetcher(fetcher: LocalPageFetcher): void {
  localFetcher = fetcher;
  logger.info('[kirei-page] Local page fetcher registered');
}

/**
 * Build the URL renderer code uses for a MangaDex page.
 */
export function toMangaDexPageUrl(chapterId: string, fileName: string): string {
  return `${SCHEME}://mangadex/${chapterId}/${fileName}`;
}

/**
 * Build the URL the renderer uses for a local page. `pageIndex` is 0-based
 * and must align with what `LocalLibraryService.listChapterPages`
 * returned; `ext` is the real entry extension so the response carries the
 * right content-type.
 */
export function toLocalPageUrl(chapterId: string, pageIndex: number, ext: string): string {
  return `${SCHEME}://local/${chapterId}/${pageIndex}.${ext}`;
}

interface ParsedMangaDexPageUrl {
  chapterId: string;
  fileName: string;
}

/**
 * Parse URL shape: kirei-page://mangadex/{chapterId}/{fileName}
 */
function parseMangaDexUrl(pathname: string): ParsedMangaDexPageUrl | null {
  const stripped = pathname.replace(/^\/+/, '');
  const parts = stripped.split('/');
  if (parts.length !== 2) return null;
  const [chapterId, fileName] = parts;
  if (!SAFE_SEGMENT.test(chapterId)) return null;
  if (!SAFE_SEGMENT.test(fileName)) return null;
  return { chapterId, fileName };
}

function cachePathFor(parsed: ParsedMangaDexPageUrl): string {
  // TODO(slice-f): LRU eviction — current cache grows unbounded.
  const root = getPagesRoot();
  return path.join(root, 'mangadex', parsed.chapterId, parsed.fileName);
}

async function writeAtomic(filePath: string, data: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, filePath);
}

function mimeForFile(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return EXT_TO_MIME[ext] ?? 'application/octet-stream';
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

interface ResolvedUpstream {
  url: string;
  prefer: 'data' | 'dataSaver';
}

/**
 * Given an at-home envelope, decide whether the requested fileName lives in
 * `data` (full quality, preferred) or `dataSaver`, and build the upstream URL.
 * Returns null if the filename isn't present in either list — happens when the
 * cached envelope is stale relative to a different chapter altogether (defensive).
 */
function resolveUpstream(
  env: MangaDexAtHomeResponse,
  fileName: string
): ResolvedUpstream | null {
  if (env.chapter.data?.includes(fileName)) {
    return {
      url: `${env.baseUrl}/data/${env.chapter.hash}/${fileName}`,
      prefer: 'data',
    };
  }
  if (env.chapter.dataSaver?.includes(fileName)) {
    return {
      url: `${env.baseUrl}/data-saver/${env.chapter.hash}/${fileName}`,
      prefer: 'dataSaver',
    };
  }
  return null;
}

/**
 * Fetch + cache the bytes for a single page. Caller has already checked the
 * disk cache and confirmed the client is wired. `allowRefresh` caps recursion
 * at one retry: on 403/404 we invalidate the at-home envelope, refetch, and
 * try once more before surrendering.
 */
async function fetchAndCache(
  parsed: ParsedMangaDexPageUrl,
  filePath: string,
  client: MangaDexPageFetcher,
  allowRefresh: boolean
): Promise<Response> {
  let env = client.getCachedAtHome(parsed.chapterId);
  if (!env) {
    try {
      env = await client.getChapterPages(parsed.chapterId);
    } catch (error) {
      logger.error(
        `[kirei-page] at-home lookup failed for ${parsed.chapterId}:`,
        error
      );
      return new Response('Upstream resolve failed', { status: 502 });
    }
  }

  const upstream = resolveUpstream(env, parsed.fileName);
  if (!upstream) {
    if (allowRefresh) {
      // The cached envelope might predate a re-upload that renamed pages.
      client.invalidateAtHome(parsed.chapterId);
      return fetchAndCache(parsed, filePath, client, false);
    }
    logger.warn(
      `[kirei-page] file not present in at-home envelope: ${parsed.chapterId}/${parsed.fileName}`
    );
    return new Response('Page not found', { status: 404 });
  }

  let fetched;
  try {
    fetched = await client.fetchPageImage(upstream.url);
  } catch (error) {
    logger.error(`[kirei-page] fetch threw for ${upstream.url}:`, error);
    return new Response('Upstream fetch failed', { status: 502 });
  }

  if (!fetched.ok) {
    if ((fetched.status === 403 || fetched.status === 404) && allowRefresh) {
      logger.warn(
        `[kirei-page] ${fetched.status} from ${upstream.url} — refreshing at-home envelope`
      );
      client.invalidateAtHome(parsed.chapterId);
      return fetchAndCache(parsed, filePath, client, false);
    }
    logger.error(
      `[kirei-page] upstream ${fetched.status} for ${upstream.url} (refresh exhausted)`
    );
    return new Response('Upstream fetch failed', { status: 502 });
  }

  await writeAtomic(filePath, fetched.buffer);

  return new Response(fetched.buffer, {
    status: 200,
    headers: {
      'Content-Type': fetched.contentType || mimeForFile(parsed.fileName),
      'Content-Length': String(fetched.buffer.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

interface ParsedLocalPageUrl {
  chapterId: string;
  pageIndex: number;
}

/**
 * Parse a local page URL. URL shape:
 *   kirei-page://local/{chapterId}/{pageIndex}.{ext}
 *
 * Extension is present in the URL for cache-friendliness and to let the
 * renderer surface the correct filename when debugging, but it is ignored
 * by the resolver — the archive's own entry list is the source of truth.
 */
function parseLocalPageUrl(pathname: string): ParsedLocalPageUrl | null {
  const stripped = pathname.replace(/^\/+/, '');
  const parts = stripped.split('/');
  if (parts.length !== 2) return null;
  const [chapterId, tail] = parts;
  if (!SAFE_SEGMENT.test(chapterId)) return null;
  const match = tail.match(/^(\d+)\.[a-z0-9]+$/i);
  if (!match) return null;
  const idx = Number.parseInt(match[1], 10);
  if (!Number.isFinite(idx) || idx < 0) return null;
  return { chapterId, pageIndex: idx };
}

async function serveLocalPage(pathname: string): Promise<Response> {
  const parsed = parseLocalPageUrl(pathname);
  if (!parsed) {
    logger.warn(`[kirei-page] Rejected malformed local URL: ${pathname}`);
    return new Response('Bad request', { status: 400 });
  }
  if (!localFetcher) {
    logger.warn('[kirei-page] Local fetcher not wired yet');
    return new Response('Page service not ready', { status: 503 });
  }
  try {
    const result = await localFetcher.readChapterPage(parsed.chapterId, parsed.pageIndex);
    if (!result) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(result.data, {
      status: 200,
      headers: {
        'Content-Type': result.mime,
        'Content-Length': String(result.data.byteLength),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    logger.error(`[kirei-page] Local read failed for ${pathname}:`, error);
    return new Response('Internal error', { status: 500 });
  }
}

/**
 * Register the kirei-page: protocol.
 *
 * URL shapes:
 *   kirei-page://mangadex/{chapterId}/{fileName}   — proxied via at-home + cached
 *   kirei-page://local/{chapterId}/{fileName}      — reserved for Slice F (404 for now)
 *
 * Cache-first behavior (offline support):
 *   Every request checks the disk cache under userData/pages/mangadex/{chapterId}/
 *   before hitting the MangaDex at-home network. Chapters with `is_downloaded=1`
 *   in the database have all their pages fully cached here, so they are served
 *   entirely from disk without any network access — enabling offline reading.
 *
 * Security:
 *  - chapterId and fileName must match [a-zA-Z0-9._-]+ (no traversal, no unicode).
 *  - Cached bytes live under userData/pages/mangadex/{chapterId}/ and are
 *    written atomically (.tmp + rename) to avoid serving torn files.
 *  - On 403/404 the at-home envelope is invalidated and refetched once.
 */
export function registerKireiPageProtocol(): void {
  getPagesRoot();

  protocol.handle(SCHEME, async request => {
    try {
      const url = new URL(request.url);
      const host = url.hostname;

      if (host === 'local') {
        return await serveLocalPage(url.pathname);
      }

      if (host !== 'mangadex') {
        return new Response('Unknown page source', { status: 400 });
      }

      const parsed = parseMangaDexUrl(url.pathname);
      if (!parsed) {
        logger.warn(`[kirei-page] Rejected malformed URL: ${request.url}`);
        return new Response('Bad request', { status: 400 });
      }

      const filePath = cachePathFor(parsed);

      // Cache hit — serves downloaded chapters (is_downloaded=1) entirely offline.
      try {
        const stat = await fs.promises.stat(filePath);
        if (stat.isFile() && stat.size > 0) {
          return await serveCachedFile(filePath, mimeForFile(parsed.fileName));
        }
      } catch {
        // miss — fall through to network fetch
      }

      if (!mangadexClient) {
        logger.warn('[kirei-page] Cache miss but MangaDex client not wired yet');
        return new Response('Page service not ready', { status: 503 });
      }

      return await fetchAndCache(parsed, filePath, mangadexClient, true);
    } catch (error) {
      logger.error('[kirei-page] Error handling request:', error);
      return new Response('Internal error', { status: 500 });
    }
  });

  logger.info('kirei-page protocol registered');
}
