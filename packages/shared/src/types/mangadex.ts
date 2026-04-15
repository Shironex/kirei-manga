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
 * Search filters passed to MangaDex search requests.
 */
export interface SearchFilters {
  title?: string;
  authors?: string[];
  tags?: string[];
  demographic?: MangaDexDemographic[];
  contentRating?: MangaDexContentRating[];
  status?: MangaDexStatus[];
  originalLanguage?: string[];
  year?: number;
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
