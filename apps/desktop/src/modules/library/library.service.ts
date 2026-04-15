import { Injectable, NotImplementedException } from '@nestjs/common';
import { createLogger } from '@kireimanga/shared';
import type { Series, ReadingStatus, Bookmark } from '@kireimanga/shared';
import { DatabaseService } from '../database';

const logger = createLogger('LibraryService');

/**
 * Local library service — manages followed series, reading progress, and
 * bookmarks in SQLite. Methods are stubbed in v0.1; actual implementation
 * lands when the MangaDex client and reader UI are wired up.
 */
@Injectable()
export class LibraryService {
  // Database wiring retained for the upcoming SQL implementation.
  constructor(private readonly db: DatabaseService) {
    logger.info('LibraryService initialized (stub)');
    void this.db;
  }

  async getAll(): Promise<Series[]> {
    throw new NotImplementedException('library:get-all not implemented yet');
  }

  async getSeries(_id: string): Promise<Series | null> {
    throw new NotImplementedException('library:get-series not implemented yet');
  }

  async follow(_mangadexId: string): Promise<Series> {
    throw new NotImplementedException('library:follow not implemented yet');
  }

  async unfollow(_id: string): Promise<void> {
    throw new NotImplementedException('library:unfollow not implemented yet');
  }

  async updateStatus(_id: string, _status: ReadingStatus): Promise<Series> {
    throw new NotImplementedException('library:update-status not implemented yet');
  }

  async updateProgress(_id: string, _chapterId: string, _page: number): Promise<void> {
    throw new NotImplementedException('library:update-progress not implemented yet');
  }

  async markChapterRead(_chapterId: string): Promise<void> {
    throw new NotImplementedException('chapter:mark-read not implemented yet');
  }

  async addBookmark(_chapterId: string, _page: number, _note?: string): Promise<Bookmark> {
    throw new NotImplementedException('chapter:add-bookmark not implemented yet');
  }

  async getBookmarks(_chapterId: string): Promise<Bookmark[]> {
    throw new NotImplementedException('chapter:get-bookmarks not implemented yet');
  }
}
