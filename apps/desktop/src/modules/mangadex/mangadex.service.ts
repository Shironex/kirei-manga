import { Injectable, NotImplementedException } from '@nestjs/common';
import { createLogger } from '@kireimanga/shared';
import type {
  MangaDexSeries,
  SearchFilters,
  SearchResult,
  Chapter,
  SeriesUpdate,
} from '@kireimanga/shared';

const logger = createLogger('MangaDexService');

/**
 * MangaDex API client service. All methods are stubbed in v0.1 — the real
 * network implementation lands in a later milestone.
 */
@Injectable()
export class MangaDexService {
  constructor() {
    logger.info('MangaDexService initialized (stub)');
  }

  async search(_query: string, _filters?: SearchFilters): Promise<SearchResult[]> {
    throw new NotImplementedException('mangadex:search not implemented yet');
  }

  async getSeries(_mangadexId: string): Promise<MangaDexSeries> {
    throw new NotImplementedException('mangadex:get-series not implemented yet');
  }

  async getChapters(_mangadexId: string, _lang?: string): Promise<Chapter[]> {
    throw new NotImplementedException('mangadex:get-chapters not implemented yet');
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
