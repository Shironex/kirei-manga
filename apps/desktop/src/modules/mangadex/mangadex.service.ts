import { Injectable, NotImplementedException } from '@nestjs/common';
import { createLogger } from '@kireimanga/shared';
import type {
  MangaDexSeries,
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
 */
function buildCoverProtocolUrl(mangaId: string, fileName: string, size = 512): string {
  // We intentionally do not encodeURIComponent the filename because MangaDex
  // filenames are UUID-ish + extension (always URL-safe) and Electron's URL
  // parsing is happier with the raw form.
  return `kirei-cover://mangadex/${mangaId}/${fileName}.${size}.jpg`;
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
 * MangaDex API service. Translates renderer payloads into client calls and
 * normalizes raw REST entities into the renderer-facing shapes.
 */
@Injectable()
export class MangaDexService {
  constructor(private readonly client: MangaDexClient) {
    logger.info('MangaDexService initialized');
  }

  async search(query: string, filters?: SearchFilters): Promise<SearchResult[]> {
    const merged: SearchFilters = {
      ...(filters ?? {}),
      title: query || filters?.title,
    };
    const response = await this.client.search(merged);
    return response.data.map(normalizeToSearchResult);
  }

  async getSeries(mangadexId: string): Promise<MangaDexSeries> {
    const response = await this.client.getSeries(mangadexId);
    return normalizeToMangaDexSeries(response.data);
  }

  async getChapters(mangadexId: string, lang?: string): Promise<Chapter[]> {
    const raw = await this.client.getChapters(mangadexId, lang);
    return raw.map(entity => normalizeToChapter(entity, mangadexId));
  }

  async getPages(_chapterId: string): Promise<string[]> {
    throw new NotImplementedException('mangadex:get-pages not implemented yet');
  }

  async downloadChapter(_chapterId: string): Promise<void> {
    throw new NotImplementedException('mangadex:download-chapter not implemented yet');
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
  normalizeToChapter,
  buildCoverProtocolUrl,
};
