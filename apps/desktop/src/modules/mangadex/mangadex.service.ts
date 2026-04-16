import { Injectable, NotImplementedException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { app } from 'electron';
import { Server } from 'socket.io';
import { createLogger, MangaDexEvents } from '@kireimanga/shared';
import type {
  MangaDexSeries,
  MangaDexSeriesDetail,
  ChapterListItem,
  SearchFilters,
  SearchResult,
  Chapter,
  SeriesUpdate,
  MangaDexMangaEntity,
  MangaDexChapterEntity,
  MangaDexLocalizedString,
  MangaDexRelationship,
  MangaDexStatus,
  MangaDexContentRating,
  MangaDexDemographic,
  MangaDexCoverSize,
  MangaDexDownloadProgressEvent,
} from '@kireimanga/shared';
import { MangaDexClient } from './mangadex.client';

const logger = createLogger('MangaDexService');

const DEFAULT_TITLE_LANG_ORDER = ['en', 'ja-ro', 'ja'];
const DEFAULT_DESC_LANG_ORDER = ['en', 'ja-ro', 'ja'];

/**
 * Resolve the first usable string from a localized map by preference order,
 * then by whatever is first in the map. Returns `undefined` if empty.
 */
function pickLocalized(
  map: MangaDexLocalizedString | undefined,
  preferred: string[] = DEFAULT_TITLE_LANG_ORDER
): string | undefined {
  if (!map) return undefined;
  for (const lang of preferred) {
    const v = map[lang];
    if (v) return v;
  }
  for (const key of Object.keys(map)) {
    const v = map[key];
    if (v) return v;
  }
  return undefined;
}

function findRelationships(
  entity: { relationships: MangaDexRelationship[] },
  type: MangaDexRelationship['type']
): MangaDexRelationship[] {
  return entity.relationships.filter(rel => rel.type === type);
}

function getCoverFileName(entity: MangaDexMangaEntity): string | undefined {
  const covers = findRelationships(entity, 'cover_art');
  for (const cover of covers) {
    const file = cover.attributes?.fileName;
    if (file) return file;
  }
  return undefined;
}

function getRelationshipName(
  entity: MangaDexMangaEntity,
  type: 'author' | 'artist'
): string | undefined {
  const rels = findRelationships(entity, type);
  for (const rel of rels) {
    const name = rel.attributes?.name;
    if (name) return name;
  }
  return undefined;
}

/**
 * Build a `kirei-cover://` URL the renderer can consume. The cover protocol
 * proxy (main process) resolves this to cached bytes from uploads.mangadex.org;
 * the renderer must never load that host directly (wrong-image on hotlink).
 *
 * `size = 'original'` omits the `.{size}.jpg` suffix — the protocol parser
 * accepts the bare `{fileName}` form and resolves it as full-size.
 */
function buildCoverProtocolUrl(
  mangaId: string,
  fileName: string,
  size: MangaDexCoverSize = 512
): string {
  // We intentionally do not encodeURIComponent the filename because MangaDex
  // filenames are UUID-ish + extension (always URL-safe) and Electron's URL
  // parsing is happier with the raw form.
  if (size === 'original') {
    return `kirei-cover://mangadex/${mangaId}/${fileName}`;
  }
  return `kirei-cover://mangadex/${mangaId}/${fileName}.${size}.jpg`;
}

/**
 * Build the full-size `kirei-cover://` URL used for the series-detail banner.
 * Thin wrapper around `buildCoverProtocolUrl(id, file, 'original')`.
 */
function buildBannerProtocolUrl(mangaId: string, fileName: string): string {
  return buildCoverProtocolUrl(mangaId, fileName, 'original');
}

function normalizeStatus(s: string | undefined): MangaDexStatus {
  switch (s) {
    case 'ongoing':
    case 'completed':
    case 'hiatus':
    case 'cancelled':
      return s;
    default:
      return 'ongoing';
  }
}

function normalizeContentRating(s: string | undefined): MangaDexContentRating {
  switch (s) {
    case 'safe':
    case 'suggestive':
    case 'erotica':
    case 'pornographic':
      return s;
    default:
      return 'safe';
  }
}

/**
 * Compare two nullable strings with a numeric-aware `localeCompare` so "10"
 * sorts after "9". Null/undefined sort last.
 */
function compareNullableString(a: string | null | undefined, b: string | null | undefined): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  return (a as string).localeCompare(b as string, undefined, { numeric: true });
}

function normalizeDemographic(s: string | null | undefined): MangaDexDemographic {
  switch (s) {
    case 'shounen':
    case 'shoujo':
    case 'josei':
    case 'seinen':
      return s;
    default:
      return 'none';
  }
}

function normalizeToSearchResult(entity: MangaDexMangaEntity): SearchResult {
  const a = entity.attributes;
  const title = pickLocalized(a.title) ?? 'Untitled';
  const description = pickLocalized(a.description, DEFAULT_DESC_LANG_ORDER);
  const fileName = getCoverFileName(entity);
  const coverUrl = fileName ? buildCoverProtocolUrl(entity.id, fileName, 512) : undefined;
  return {
    id: entity.id,
    title,
    coverUrl,
    author: getRelationshipName(entity, 'author'),
    status: normalizeStatus(a.status),
    contentRating: normalizeContentRating(a.contentRating),
    description,
    tags: a.tags.map(t => pickLocalized(t.attributes.name) ?? t.id).filter(Boolean),
    lastChapter: a.lastChapter ?? undefined,
    year: a.year ?? undefined,
  };
}

function normalizeToMangaDexSeries(entity: MangaDexMangaEntity): MangaDexSeries {
  const a = entity.attributes;
  const title = pickLocalized(a.title) ?? 'Untitled';
  const titleJapanese = a.title['ja'] ?? a.altTitles.find(t => 'ja' in t)?.['ja'];
  const alternativeTitles = a.altTitles
    .map(t => pickLocalized(t))
    .filter((v): v is string => Boolean(v));
  const fileName = getCoverFileName(entity);
  const coverUrl = fileName ? buildCoverProtocolUrl(entity.id, fileName, 512) : undefined;

  return {
    id: entity.id,
    title,
    titleJapanese,
    alternativeTitles,
    description: pickLocalized(a.description, DEFAULT_DESC_LANG_ORDER) ?? '',
    author: getRelationshipName(entity, 'author'),
    artist: getRelationshipName(entity, 'artist'),
    coverUrl,
    status: normalizeStatus(a.status),
    contentRating: normalizeContentRating(a.contentRating),
    demographic: normalizeDemographic(a.publicationDemographic),
    tags: a.tags.map(t => pickLocalized(t.attributes.name) ?? t.id).filter(Boolean),
    originalLanguage: a.originalLanguage,
    year: a.year ?? undefined,
    lastChapter: a.lastChapter ?? undefined,
    updatedAt: a.updatedAt,
  };
}

/**
 * Superset of `normalizeToMangaDexSeries` — adds the series-detail fields
 * (banner URL, availableTranslatedLanguages) that the renderer needs for the
 * detail page. `normalizeToMangaDexSeries` is kept for LibraryService.follow
 * which upserts into the lighter `Series` row shape.
 */
function normalizeToMangaDexSeriesDetail(entity: MangaDexMangaEntity): MangaDexSeriesDetail {
  const a = entity.attributes;
  const title = pickLocalized(a.title) ?? 'Untitled';
  const titleJapanese = a.title['ja'] ?? a.altTitles.find(t => 'ja' in t)?.['ja'];
  const alternativeTitles = a.altTitles
    .map(t => pickLocalized(t))
    .filter((v): v is string => Boolean(v));
  const fileName = getCoverFileName(entity);
  const coverUrl = fileName ? buildCoverProtocolUrl(entity.id, fileName, 512) : undefined;
  const bannerUrl = fileName ? buildBannerProtocolUrl(entity.id, fileName) : undefined;
  const availableTranslatedLanguages = (a.availableTranslatedLanguages ?? []).filter(
    (l): l is string => typeof l === 'string'
  );

  return {
    id: entity.id,
    title,
    titleJapanese,
    alternativeTitles,
    description: pickLocalized(a.description, DEFAULT_DESC_LANG_ORDER) ?? '',
    author: getRelationshipName(entity, 'author'),
    artist: getRelationshipName(entity, 'artist'),
    coverUrl,
    bannerUrl,
    status: normalizeStatus(a.status),
    contentRating: normalizeContentRating(a.contentRating),
    demographic: normalizeDemographic(a.publicationDemographic),
    tags: a.tags.map(t => pickLocalized(t.attributes.name) ?? t.id).filter(Boolean),
    originalLanguage: a.originalLanguage,
    availableTranslatedLanguages,
    year: a.year ?? undefined,
    lastChapter: a.lastChapter ?? undefined,
    // totalChapters / latestChapterUpdatedAt intentionally left undefined in phase 2 —
    // resolving them would require a second feed call. The phase-4 chapter list hook
    // supplies the count to the UI separately.
    updatedAt: a.updatedAt,
  };
}

/**
 * Normalize a raw chapter entity into the renderer-facing `ChapterListItem`.
 * Preserves `volume`/`chapter`/`title`/`externalUrl` as `string | null` — the
 * UI formats them; do not coerce (MangaDex uses values like "Extra" or "7.5").
 */
function normalizeToChapterListItem(entity: MangaDexChapterEntity): ChapterListItem {
  const a = entity.attributes;
  const scanlationGroup = entity.relationships?.find(r => r.type === 'scanlation_group')
    ?.attributes?.name;
  // The chapter feed includes a `manga` relationship by default — surface it
  // so the reader can resolve a series without a second round-trip. Empty
  // string fallback keeps the type non-nullable while flagging upstream gaps.
  const seriesId = entity.relationships?.find(r => r.type === 'manga')?.id ?? '';
  return {
    id: entity.id,
    seriesId,
    volume: a.volume,
    chapter: a.chapter,
    title: a.title,
    translatedLanguage: a.translatedLanguage,
    publishAt: a.publishAt,
    pages: a.pages,
    scanlationGroup: scanlationGroup || undefined,
    externalUrl: a.externalUrl,
  };
}

function normalizeToChapter(entity: MangaDexChapterEntity, seriesId: string): Chapter {
  const a = entity.attributes;
  const chapterNumber = a.chapter ? Number(a.chapter) : NaN;
  const volumeNumber = a.volume ? Number(a.volume) : undefined;
  return {
    id: entity.id,
    seriesId,
    title: a.title ?? undefined,
    chapterNumber: Number.isFinite(chapterNumber) ? chapterNumber : 0,
    volumeNumber: volumeNumber !== undefined && Number.isFinite(volumeNumber) ? volumeNumber : undefined,
    source: 'mangadex',
    mangadexChapterId: entity.id,
    pageCount: a.pages,
    isDownloaded: false,
    isRead: false,
    lastReadPage: 0,
    readAt: undefined,
  };
}

/**
 * Write a buffer atomically (temp file + rename) to avoid serving torn files.
 * Mirrors the pattern in kirei-page.ts.
 */
async function writeAtomic(filePath: string, data: Buffer): Promise<void> {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, filePath);
}

/**
 * MangaDex API service. Translates renderer payloads into client calls and
 * normalizes raw REST entities into the renderer-facing shapes.
 */
@Injectable()
export class MangaDexService {
  private server: Server | null = null;
  private readonly downloadQueue = new Map<string, Promise<void>>();
  private downloadChain: Promise<void> = Promise.resolve();

  constructor(private readonly client: MangaDexClient) {
    logger.info('MangaDexService initialized');
  }

  /** Called by the gateway after WebSocket server init to enable progress emit. */
  setServer(server: Server): void {
    this.server = server;
  }

  async search(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    const merged: SearchFilters = {
      ...(filters ?? {}),
      title: query || filters?.title,
    };
    const response = await this.client.search(merged);
    return response.data.map(normalizeToSearchResult);
  }

  async getSeries(mangadexId: string): Promise<MangaDexSeriesDetail> {
    const response = await this.client.getSeries(mangadexId);
    return normalizeToMangaDexSeriesDetail(response.data);
  }

  async getChapters(mangadexId: string, lang?: string): Promise<ChapterListItem[]> {
    const raw = await this.client.getChapters(mangadexId, lang);

    // 1. Drop entries hosted off-MangaDex or with zero pages — the reader
    //    can't open them, and they'd clutter the chapter list.
    const usable = raw.filter(e => !e.attributes.externalUrl && e.attributes.pages !== 0);

    // 2. Dedupe by (language, volume, chapter) — MangaDex sometimes returns
    //    multiple uploads for the same chapter; keep the most recent.
    const byKey = new Map<string, MangaDexChapterEntity>();
    for (const entity of usable) {
      const a = entity.attributes;
      const key = `${a.translatedLanguage}|${a.volume ?? ''}|${a.chapter ?? ''}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, entity);
        continue;
      }
      const existingAt = existing.attributes.readableAt ?? existing.attributes.publishAt;
      const candidateAt = a.readableAt ?? a.publishAt;
      if (candidateAt > existingAt) {
        byKey.set(key, entity);
      }
    }

    // 3. Re-sort ascending by (volume, chapter) with numeric-aware compare.
    //    null/undefined last within each position.
    const sorted = Array.from(byKey.values()).sort((x, y) => {
      const vx = x.attributes.volume;
      const vy = y.attributes.volume;
      const vCmp = compareNullableString(vx, vy);
      if (vCmp !== 0) return vCmp;
      return compareNullableString(x.attributes.chapter, y.attributes.chapter);
    });

    return sorted.map(normalizeToChapterListItem);
  }

  /**
   * Resolve a chapter's pages to `kirei-page://mangadex/{chapterId}/{file}` URLs
   * the renderer can hand to <img>. The actual at-home mirror baseUrl rotates
   * frequently, so we don't bake it into the URL — the protocol handler looks
   * it up on demand via `MangaDexClient.getCachedAtHome` (and refetches when
   * expired or when the upstream 403/404s).
   *
   * Filenames are emitted raw. They're MangaDex content-addressed names
   * matching `[a-zA-Z0-9._-]+`, which is the SAFE_SEGMENT pattern the
   * protocol handler validates against — encoding would defeat that check.
   */
  async getPages(chapterId: string, prefer: 'data' | 'dataSaver' = 'data'): Promise<string[]> {
    const env = await this.client.getChapterPages(chapterId);
    const primary = prefer === 'dataSaver' ? env.chapter.dataSaver : env.chapter.data;
    const fallback = prefer === 'dataSaver' ? env.chapter.data : env.chapter.dataSaver;
    const files = primary && primary.length > 0 ? primary : (fallback ?? []);
    return files.map(fn => `kirei-page://mangadex/${chapterId}/${fn}`);
  }

  /**
   * Download all pages for a chapter into the kirei-page disk cache. Downloads
   * are serialized one at a time via a promise chain. Progress events stream
   * via `mangadex:download-progress` after each page. On completion the chapter
   * row is upserted with `is_downloaded=1`.
   *
   * @param db - The DatabaseService instance for upserting the chapter row.
   */
  downloadChapter(
    chapterId: string,
    mangadexSeriesId: string,
    db?: { db: { prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown } } }
  ): void {
    // Already in-flight — skip.
    if (this.downloadQueue.has(chapterId)) {
      logger.info(`Download already in progress for chapter ${chapterId}`);
      return;
    }

    const task = this.downloadChain
      .then(() => this.executeDownload(chapterId, mangadexSeriesId, db))
      .catch(err => {
        logger.error(`Download failed for chapter ${chapterId}:`, err);
      })
      .finally(() => {
        this.downloadQueue.delete(chapterId);
      });

    this.downloadQueue.set(chapterId, task);
    this.downloadChain = task;
  }

  private emitProgress(event: MangaDexDownloadProgressEvent): void {
    if (this.server) {
      this.server.emit(MangaDexEvents.DOWNLOAD_PROGRESS, event);
    }
  }

  private async executeDownload(
    chapterId: string,
    mangadexSeriesId: string,
    db?: { db: { prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown } } }
  ): Promise<void> {
    let pagesRoot: string;
    try {
      pagesRoot = path.join(app.getPath('userData'), 'pages');
    } catch {
      // Fallback for test environments where app is not available
      pagesRoot = path.join(process.cwd(), '.userData', 'pages');
    }

    logger.info(`Starting download for chapter ${chapterId}`);

    let env;
    try {
      env = await this.client.getChapterPages(chapterId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to get at-home envelope for ${chapterId}: ${message}`);
      this.emitProgress({ chapterId, current: 0, total: 0, status: 'error', error: message });
      return;
    }

    const files = env.chapter.data;
    const total = files.length;

    if (total === 0) {
      logger.warn(`Chapter ${chapterId} has no pages`);
      this.emitProgress({ chapterId, current: 0, total: 0, status: 'complete' });
      return;
    }

    for (let i = 0; i < total; i++) {
      const fileName = files[i];
      const filePath = path.join(pagesRoot, 'mangadex', chapterId, fileName);

      // Check disk cache — skip if already present.
      try {
        const stat = await fs.promises.stat(filePath);
        if (stat.isFile() && stat.size > 0) {
          this.emitProgress({ chapterId, current: i + 1, total, status: 'downloading' });
          continue;
        }
      } catch {
        // File doesn't exist — proceed to fetch.
      }

      const url = `${env.baseUrl}/data/${env.chapter.hash}/${fileName}`;
      let fetched;
      try {
        fetched = await this.client.fetchPageImage(url);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to fetch page ${i + 1}/${total} for ${chapterId}: ${message}`);
        this.emitProgress({ chapterId, current: i + 1, total, status: 'error', error: message });
        return;
      }

      if (!fetched.ok) {
        const message = `Upstream returned ${fetched.status} for page ${i + 1}/${total}`;
        logger.error(`${message} (chapter ${chapterId})`);
        this.emitProgress({ chapterId, current: i + 1, total, status: 'error', error: message });
        return;
      }

      await writeAtomic(filePath, fetched.buffer);
      this.emitProgress({ chapterId, current: i + 1, total, status: 'downloading' });
    }

    // Mark chapter as downloaded in the database.
    if (db) {
      try {
        // Resolve local series id from mangadex_id.
        const seriesRow = db.db
          .prepare('SELECT id FROM series WHERE mangadex_id = ?')
          .get(mangadexSeriesId) as { id: string } | undefined;

        if (seriesRow) {
          // Upsert chapter row with is_downloaded=1.
          db.db
            .prepare(
              `INSERT INTO chapters (
                 id, series_id, source, mangadex_chapter_id,
                 chapter_number, page_count, is_downloaded, is_read, last_read_page
               ) VALUES (?, ?, 'mangadex', ?, 0, ?, 1, 0, 0)
               ON CONFLICT(mangadex_chapter_id) DO UPDATE SET
                 is_downloaded = 1,
                 page_count = MAX(chapters.page_count, excluded.page_count)`
            )
            .run(randomUUID(), seriesRow.id, chapterId, total);
          logger.info(`Marked chapter ${chapterId} as downloaded (series ${seriesRow.id})`);
        } else {
          logger.warn(`Series with mangadex_id=${mangadexSeriesId} not found in library — skipping DB upsert`);
        }
      } catch (err) {
        logger.error(`Failed to upsert chapter row for ${chapterId}:`, err);
      }
    }

    this.emitProgress({ chapterId, current: total, total, status: 'complete' });
    logger.info(`Download complete for chapter ${chapterId} (${total} pages)`);
  }

  async checkUpdates(): Promise<SeriesUpdate[]> {
    throw new NotImplementedException('mangadex:check-updates not implemented yet');
  }
}

// Exported for unit tests.
export const __test = {
  pickLocalized,
  normalizeToSearchResult,
  normalizeToMangaDexSeries,
  normalizeToMangaDexSeriesDetail,
  normalizeToChapter,
  normalizeToChapterListItem,
  buildCoverProtocolUrl,
  buildBannerProtocolUrl,
  compareNullableString,
};
