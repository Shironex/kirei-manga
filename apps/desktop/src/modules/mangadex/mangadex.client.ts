import { Injectable } from '@nestjs/common';
import { createLogger } from '@kireimanga/shared';
import type {
  MangaDexApiListResponse,
  MangaDexApiEntityResponse,
  MangaDexMangaEntity,
  MangaDexChapterEntity,
  MangaDexAtHomeResponse,
  MangaDexCoverSize,
  SearchFilters,
} from '@kireimanga/shared';

const logger = createLogger('MangaDexClient');

const API_BASE = 'https://api.mangadex.org';
const UPLOADS_BASE = 'https://uploads.mangadex.org';
const USER_AGENT = 'KireiManga/0.1.0 (https://github.com/Shironex/kirei-manga)';

// Rate limit intervals.
// - general bucket: api.mangadex.org global cap ~5 rps/IP → leave headroom at ~4.5 rps (220ms).
// - at-home bucket: /at-home/server/{id} is 40/min ≈ 0.67 rps → 1500ms between calls.
const GENERAL_INTERVAL_MS = 220;
const AT_HOME_INTERVAL_MS = 1500;

const MAX_RETRIES = 3;
const DEFAULT_TTL_MS = 5 * 60_000;
const AT_HOME_TTL_MS = 15 * 60_000;

/** Minimum interval gate serialized via a promise chain. */
class MinIntervalGate {
  private next = Promise.resolve();

  constructor(private readonly intervalMs: number) {}

  schedule<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.next.then(async () => {
      const started = Date.now();
      try {
        return await fn();
      } finally {
        const elapsed = Date.now() - started;
        const wait = this.intervalMs - elapsed;
        if (wait > 0) {
          await sleep(wait);
        }
      }
    });
    // Keep the chain free of rejections so one failure doesn't break the gate.
    this.next = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

function getFetch(): FetchLike {
  // electron.net.fetch is only available inside an Electron main process.
  // In Jest we fall back to the global fetch (node 18+ / jsdom / test mock).
  try {
    // Dynamic require so tests without electron installed still work.

    const mod = require('electron') as { net?: { fetch?: FetchLike } };
    if (mod?.net?.fetch) {
      return mod.net.fetch.bind(mod.net);
    }
  } catch {
    // not in Electron runtime
  }
  if (typeof globalThis.fetch !== 'function') {
    throw new Error('No fetch implementation available');
  }
  return globalThis.fetch.bind(globalThis);
}

/**
 * Append a query value. Arrays are serialized as repeated `key[]=value` pairs
 * which is the form MangaDex expects (e.g. `contentRating[]=safe`).
 */
function appendParam(params: URLSearchParams, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const v of value) {
      if (v === undefined || v === null) continue;
      params.append(`${key}[]`, String(v));
    }
    return;
  }
  if (typeof value === 'object') {
    // For `order` — serialized as `order[field]=asc`.
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || v === null) continue;
      params.append(`${key}[${k}]`, String(v));
    }
    return;
  }
  params.append(key, String(value));
}

function buildSearchParams(filters: SearchFilters): URLSearchParams {
  const params = new URLSearchParams();
  const {
    title,
    authors,
    artists,
    year,
    includedTags,
    excludedTags,
    includedTagsMode,
    excludedTagsMode,
    status,
    originalLanguage,
    excludedOriginalLanguage,
    availableTranslatedLanguage,
    publicationDemographic,
    contentRating,
    order,
    includes,
    limit,
    offset,
  } = filters;

  if (title) params.append('title', title);
  appendParam(params, 'authors', authors);
  appendParam(params, 'artists', artists);
  if (year !== undefined) params.append('year', String(year));
  appendParam(params, 'includedTags', includedTags);
  appendParam(params, 'excludedTags', excludedTags);
  if (includedTagsMode) params.append('includedTagsMode', includedTagsMode);
  if (excludedTagsMode) params.append('excludedTagsMode', excludedTagsMode);
  appendParam(params, 'status', status);
  appendParam(params, 'originalLanguage', originalLanguage);
  appendParam(params, 'excludedOriginalLanguage', excludedOriginalLanguage);
  appendParam(params, 'availableTranslatedLanguage', availableTranslatedLanguage);
  appendParam(params, 'publicationDemographic', publicationDemographic);
  appendParam(params, 'contentRating', contentRating);
  if (order) appendParam(params, 'order', order);
  appendParam(params, 'includes', includes);
  if (limit !== undefined) params.append('limit', String(limit));
  if (offset !== undefined) params.append('offset', String(offset));

  return params;
}

/**
 * Parse a 429's retry hint. Prefers `X-RateLimit-Retry-After` (UNIX epoch seconds).
 * Falls back to `Retry-After` (seconds), then a 2s default.
 */
function computeRetryDelayMs(response: Response): number {
  const epochHeader = response.headers.get('x-ratelimit-retry-after');
  if (epochHeader) {
    const epochSec = Number(epochHeader);
    if (Number.isFinite(epochSec) && epochSec > 0) {
      return Math.max(epochSec * 1000 - Date.now(), 0);
    }
  }
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }
  return 2000;
}

/**
 * MangaDex HTTP client. Main-process only — the renderer must never call
 * `api.mangadex.org` or `uploads.mangadex.org` directly (MangaDex serves a
 * wrong-image response when covers are hotlinked from a third-party origin).
 */
@Injectable()
export class MangaDexClient {
  private readonly generalGate = new MinIntervalGate(GENERAL_INTERVAL_MS);
  private readonly atHomeGate = new MinIntervalGate(AT_HOME_INTERVAL_MS);
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  /** Perform a GET with rate limiting and 429 retry. */
  private async get<T>(url: string, gate: MinIntervalGate): Promise<T> {
    const fetchFn = getFetch();
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const response = await gate.schedule(() => fetchFn(url, { method: 'GET', headers }));

      if (response.status === 429) {
        if (attempt === MAX_RETRIES) {
          throw new Error(`MangaDex 429 after ${MAX_RETRIES} retries: ${url}`);
        }
        const delayMs = computeRetryDelayMs(response);
        logger.warn(
          `429 from MangaDex (${url}) — retry ${attempt + 1}/${MAX_RETRIES} in ${delayMs}ms`
        );
        await sleep(delayMs);
        continue;
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `MangaDex ${response.status} ${response.statusText} for ${url}: ${body.slice(0, 200)}`
        );
      }

      return (await response.json()) as T;
    }

    throw new Error(`MangaDex request exhausted retries: ${url}`);
  }

  /** GET with a simple TTL cache keyed by `key`. */
  private async cachedGet<T>(
    key: string,
    url: string,
    ttlMs: number = DEFAULT_TTL_MS,
    gate: MinIntervalGate = this.generalGate
  ): Promise<T> {
    const hit = this.cache.get(key);
    const now = Date.now();
    if (hit && hit.expiresAt > now) {
      return hit.data as T;
    }
    const data = await this.get<T>(url, gate);
    this.cache.set(key, { data, expiresAt: now + ttlMs });
    return data;
  }

  /** Clear the internal TTL cache. Primarily useful in tests. */
  clearCache(): void {
    this.cache.clear();
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Full-text + filter search on `/manga`. Applies sensible defaults:
   * `limit=24`, `includes=['cover_art','author','artist']`.
   */
  async search(
    filters: SearchFilters
  ): Promise<MangaDexApiListResponse<MangaDexMangaEntity>> {
    const merged: SearchFilters = {
      limit: 24,
      includes: ['cover_art', 'author', 'artist'],
      ...filters,
    };
    // Enforce API caps.
    if (merged.limit !== undefined) {
      merged.limit = Math.min(Math.max(merged.limit, 1), 100);
    }
    if (merged.offset !== undefined && merged.limit !== undefined) {
      if (merged.offset + merged.limit > 10000) {
        merged.offset = Math.max(0, 10000 - merged.limit);
      }
    }

    const params = buildSearchParams(merged);
    const url = `${API_BASE}/manga?${params.toString()}`;
    const key = `search:${params.toString()}`;
    return this.cachedGet(key, url, DEFAULT_TTL_MS, this.generalGate);
  }

  /** Single-series fetch with cover/author/artist relationships expanded. */
  async getSeries(
    id: string
  ): Promise<MangaDexApiEntityResponse<MangaDexMangaEntity>> {
    const params = new URLSearchParams();
    for (const inc of ['cover_art', 'author', 'artist']) {
      params.append('includes[]', inc);
    }
    const url = `${API_BASE}/manga/${encodeURIComponent(id)}?${params.toString()}`;
    return this.cachedGet(`series:${id}`, url, DEFAULT_TTL_MS, this.generalGate);
  }

  /**
   * Paginated chapter feed. Returns every chapter entity (auto-paginates until
   * `offset >= total` or the MangaDex `offset + limit ≤ 10000` cap is reached).
   * Normalization/filtering/dedupe happens in the service layer.
   */
  async getChapters(seriesId: string, lang?: string): Promise<MangaDexChapterEntity[]> {
    const collected: MangaDexChapterEntity[] = [];
    const LIMIT = 500;
    const MAX_OFFSET = 10000;
    let offset = 0;

    // MangaDex caps `offset + limit ≤ 10000` on the feed endpoint — bail before
    // we'd exceed it rather than letting the API 400 us.
    while (offset + LIMIT <= MAX_OFFSET) {
      const params = new URLSearchParams();
      params.append('limit', String(LIMIT));
      params.append('offset', String(offset));
      params.append('order[volume]', 'asc');
      params.append('order[chapter]', 'asc');
      params.append('includes[]', 'scanlation_group');
      if (lang) params.append('translatedLanguage[]', lang);

      const url = `${API_BASE}/manga/${encodeURIComponent(seriesId)}/feed?${params.toString()}`;
      const key = `feed:${seriesId}:${lang ?? 'any'}:${offset}`;
      const page = await this.cachedGet<MangaDexApiListResponse<MangaDexChapterEntity>>(
        key,
        url,
        DEFAULT_TTL_MS,
        this.generalGate
      );

      collected.push(...page.data);
      offset += page.data.length || LIMIT;

      if (!page.data.length || offset >= page.total) break;
    }

    return collected;
  }

  /**
   * Resolve chapter page URLs. Rate limited to the stricter at-home bucket.
   * Cached briefly because the rotating `baseUrl` expires.
   */
  async getChapterPages(chapterId: string): Promise<MangaDexAtHomeResponse> {
    const url = `${API_BASE}/at-home/server/${encodeURIComponent(chapterId)}`;
    return this.cachedGet(`athome:${chapterId}`, url, AT_HOME_TTL_MS, this.atHomeGate);
  }

  /**
   * Read the unexpired at-home envelope for a chapter from the internal TTL
   * cache without hitting the network. Returns `null` if there is no entry or
   * if it has expired. Used by the kirei-page protocol handler to resolve
   * `{baseUrl, hash}` synchronously on cache hits.
   */
  getCachedAtHome(chapterId: string): MangaDexAtHomeResponse | null {
    const hit = this.cache.get(`athome:${chapterId}`);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) return null;
    return hit.data as MangaDexAtHomeResponse;
  }

  /**
   * Drop the cached at-home envelope for a single chapter. Called by the
   * page protocol handler when a previously resolved upstream URL 403/404s,
   * so the next `getChapterPages` call re-fetches a fresh rotating baseUrl.
   */
  invalidateAtHome(chapterId: string): void {
    this.cache.delete(`athome:${chapterId}`);
  }

  /**
   * Drop every cached at-home envelope. Called when the user clears the
   * kirei-page disk cache so the next read re-fetches a fresh baseUrl rather
   * than serving from a stale in-memory mirror.
   */
  invalidateAllAtHome(): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith('athome:')) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Pure string builder — does NOT hit the network. MangaDex cover filenames
   * already live under `uploads.mangadex.org/covers/{mangaId}/{fileName}`; the
   * `.256.jpg` / `.512.jpg` suffix asks for a resized thumbnail.
   */
  resolveCoverUrl(mangaId: string, fileName: string, size: MangaDexCoverSize = 512): string {
    const base = `${UPLOADS_BASE}/covers/${encodeURIComponent(mangaId)}/${encodeURIComponent(fileName)}`;
    if (size === 'original') return base;
    return `${base}.${size}.jpg`;
  }

  /**
   * Fetch the cover image bytes for proxy caching through the kirei-cover://
   * custom protocol. Uses the general rate-limit bucket since this hits the
   * uploads CDN, not the API (same host family, still share our IP budget).
   */
  async fetchCoverImage(
    mangaId: string,
    fileName: string,
    size: MangaDexCoverSize = 512
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const url = this.resolveCoverUrl(mangaId, fileName, size);
    const fetchFn = getFetch();
    const response = await this.generalGate.schedule(() =>
      fetchFn(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
      })
    );
    if (!response.ok) {
      throw new Error(`Cover fetch failed ${response.status} for ${url}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    return { buffer: Buffer.from(arrayBuffer), contentType };
  }

  /**
   * Fetch a chapter page image from a fully-resolved at-home mirror URL. The
   * caller (kirei-page protocol handler) is responsible for building the URL
   * from `getChapterPages` output. Returns the raw bytes plus the upstream
   * status so the handler can distinguish 403/404 (rotated baseUrl — needs
   * refetch + retry) from other failures.
   */
  async fetchPageImage(url: string): Promise<{
    ok: boolean;
    status: number;
    buffer: Buffer;
    contentType: string;
  }> {
    const fetchFn = getFetch();
    const response = await this.generalGate.schedule(() =>
      fetchFn(url, {
        method: 'GET',
        headers: { 'User-Agent': USER_AGENT },
      })
    );
    if (!response.ok) {
      // Drain the body so the connection can be reused.
      try {
        await response.arrayBuffer();
      } catch {
        // ignore
      }
      return {
        ok: false,
        status: response.status,
        buffer: Buffer.alloc(0),
        contentType: response.headers.get('content-type') ?? '',
      };
    }
    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    return {
      ok: true,
      status: response.status,
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  }
}
