/**
 * MangaDex publication status.
 */
export type MangaDexStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled';

/**
 * MangaDex content rating.
 */
export type MangaDexContentRating = 'safe' | 'suggestive' | 'erotica' | 'pornographic';

/**
 * Demographic classification.
 */
export type MangaDexDemographic = 'shounen' | 'shoujo' | 'josei' | 'seinen' | 'none';

/**
 * Cover image size. MangaDex exposes 256 and 512 thumbnails plus the original.
 */
export type MangaDexCoverSize = 256 | 512 | 'original';

// ============================================================================
// Raw MangaDex REST API response shapes
// ============================================================================

/**
 * List envelope returned by collection endpoints (e.g. `/manga`, `/manga/{id}/feed`).
 */
export interface MangaDexApiListResponse<T> {
  result: 'ok' | 'error';
  response: 'collection';
  data: T[];
  limit: number;
  offset: number;
  total: number;
}

/**
 * Envelope returned by single-entity endpoints (e.g. `/manga/{id}`).
 */
export interface MangaDexApiEntityResponse<T> {
  result: 'ok' | 'error';
  response: 'entity';
  data: T;
}

/**
 * Localized string map — ISO language code (or pseudo-codes like `ja-ro`) → translated string.
 */
export type MangaDexLocalizedString = Record<string, string>;

/**
 * A MangaDex tag (genre / theme / format / content).
 */
export interface MangaDexTag {
  id: string;
  type: 'tag';
  attributes: {
    name: MangaDexLocalizedString;
    description?: MangaDexLocalizedString;
    group: 'genre' | 'theme' | 'format' | 'content';
    version: number;
  };
}

/**
 * Relationship entry on a MangaDex entity. `attributes` is only populated when
 * the caller passed `includes[]=<type>` on the request.
 */
export type MangaDexRelationshipType =
  | 'manga'
  | 'chapter'
  | 'cover_art'
  | 'author'
  | 'artist'
  | 'scanlation_group'
  | 'tag'
  | 'user'
  | 'leader'
  | 'member';

export interface MangaDexRelationship {
  id: string;
  type: MangaDexRelationshipType;
  related?: string;
  attributes?: {
    fileName?: string;
    name?: string;
    [key: string]: unknown;
  };
}

/**
 * Attributes of a manga entity as returned by `/manga`.
 */
export interface MangaDexMangaAttributes {
  title: MangaDexLocalizedString;
  altTitles: MangaDexLocalizedString[];
  description: MangaDexLocalizedString;
  isLocked?: boolean;
  originalLanguage: string;
  lastVolume?: string | null;
  lastChapter?: string | null;
  publicationDemographic?: MangaDexDemographic | null;
  status: MangaDexStatus;
  year?: number | null;
  contentRating: MangaDexContentRating;
  tags: MangaDexTag[];
  state?: string;
  chapterNumbersResetOnNewVolume?: boolean;
  availableTranslatedLanguages: (string | null)[];
  latestUploadedChapter?: string | null;
  createdAt?: string;
  updatedAt: string;
  version?: number;
}

export interface MangaDexMangaEntity {
  id: string;
  type: 'manga';
  attributes: MangaDexMangaAttributes;
  relationships: MangaDexRelationship[];
}

/**
 * Attributes of a chapter entity as returned by `/manga/{id}/feed`.
 */
export interface MangaDexChapterAttributes {
  title: string | null;
  volume: string | null;
  chapter: string | null;
  pages: number;
  translatedLanguage: string;
  uploader?: string;
  externalUrl: string | null;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
  publishAt: string;
  readableAt: string;
}

export interface MangaDexChapterEntity {
  id: string;
  type: 'chapter';
  attributes: MangaDexChapterAttributes;
  relationships: MangaDexRelationship[];
}

/**
 * Response from `/at-home/server/{chapterId}` used to resolve chapter page URLs.
 * URLs rotate frequently so this response should be cached briefly (≤ 15min).
 */
export interface MangaDexAtHomeResponse {
  result: 'ok' | 'error';
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

// ============================================================================
// Normalized shapes exposed to the renderer
// ============================================================================

/**
 * Normalized MangaDex series metadata.
 */
export interface MangaDexSeries {
  id: string;
  title: string;
  titleJapanese?: string;
  alternativeTitles: string[];
  description: string;
  author?: string;
  artist?: string;
  coverUrl?: string;
  bannerUrl?: string;
  status: MangaDexStatus;
  contentRating: MangaDexContentRating;
  demographic: MangaDexDemographic;
  tags: string[];
  originalLanguage?: string;
  year?: number;
  lastChapter?: string;
  updatedAt?: string;
}

/**
 * Ordering configuration for the search endpoint. Each key maps to `asc` / `desc`.
 * See https://api.mangadex.org/docs/swagger.html#/Manga/get-search-manga
 */
export interface MangaDexSearchOrder {
  title?: 'asc' | 'desc';
  year?: 'asc' | 'desc';
  createdAt?: 'asc' | 'desc';
  updatedAt?: 'asc' | 'desc';
  latestUploadedChapter?: 'asc' | 'desc';
  followedCount?: 'asc' | 'desc';
  relevance?: 'asc' | 'desc';
  rating?: 'asc' | 'desc';
}

export type MangaDexIncludes = 'cover_art' | 'author' | 'artist' | 'tag';

/**
 * Search filters passed to MangaDex search requests. Mirrors the `/manga` query params.
 * Caps (enforced at the client): `limit` ≤ 100, `offset + limit` ≤ 10000.
 */
export interface SearchFilters {
  title?: string;
  authors?: string[];
  artists?: string[];
  year?: number;
  includedTags?: string[];
  excludedTags?: string[];
  includedTagsMode?: 'AND' | 'OR';
  excludedTagsMode?: 'AND' | 'OR';
  status?: MangaDexStatus[];
  originalLanguage?: string[];
  excludedOriginalLanguage?: string[];
  availableTranslatedLanguage?: string[];
  publicationDemographic?: MangaDexDemographic[];
  contentRating?: MangaDexContentRating[];
  order?: MangaDexSearchOrder;
  includes?: MangaDexIncludes[];
  limit?: number;
  offset?: number;
}

/**
 * One entry in a MangaDex search result list.
 */
export interface SearchResult {
  id: string;
  title: string;
  coverUrl?: string;
  author?: string;
  status: MangaDexStatus;
  contentRating: MangaDexContentRating;
  description?: string;
  tags: string[];
  lastChapter?: string;
  year?: number;
}

/**
 * OCR result for a single bubble (produced by the manga-ocr sidecar).
 */
export interface OcrResult {
  boxIndex: number;
  text: string;
  confidence?: number;
}
