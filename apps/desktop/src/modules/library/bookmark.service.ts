import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createLogger } from '@kireimanga/shared';
import type { BookmarkWithChapter, ChapterAddBookmarkPayload } from '@kireimanga/shared';
import { DatabaseService } from '../database';
import { LibraryService } from './library.service';

const logger = createLogger('BookmarkService');

/**
 * Joined row shape returned by the bookmark lookup queries. Columns prefixed
 * with `c_` come from `chapters` so they don't collide with bookmark columns.
 */
interface BookmarkJoinRow {
  id: string;
  chapter_id: string;
  series_id: string;
  page: number;
  note: string | null;
  created_at: string;
  c_mangadex_chapter_id: string;
  c_chapter_number: number | null;
  c_volume_number: number | null;
  c_title: string | null;
  s_mangadex_id: string;
}

/**
 * CRUD over the `bookmarks` table. `add` upserts the chapter row so users can
 * bookmark a page before ever reading it; the UNIQUE(chapter_id, page) index
 * makes `add` idempotent. `getForSeries` / `remove` are single-query. Every
 * returned `BookmarkWithChapter` carries MangaDex ids so the renderer never
 * holds local database ids.
 */
@Injectable()
export class BookmarkService {
  constructor(
    private readonly db: DatabaseService,
    private readonly library: LibraryService
  ) {
    logger.info('BookmarkService initialized');
  }

  private rowToBookmark(row: BookmarkJoinRow): BookmarkWithChapter {
    return {
      id: row.id,
      chapterId: row.chapter_id,
      seriesId: row.series_id,
      page: row.page,
      note: row.note ?? undefined,
      createdAt: new Date(row.created_at),
      mangadexChapterId: row.c_mangadex_chapter_id,
      mangadexSeriesId: row.s_mangadex_id,
      chapterNumber: row.c_chapter_number ?? undefined,
      volumeNumber: row.c_volume_number ?? undefined,
      chapterTitle: row.c_title ?? undefined,
    };
  }

  /**
   * Add (or return the existing) bookmark for a MangaDex chapter/page.
   * Upserts the chapter row so unread chapters can still be bookmarked,
   * then `INSERT OR IGNORE`s the bookmark — the UNIQUE(chapter_id, page)
   * constraint means re-adding the same page is a no-op and returns the
   * existing row.
   */
  async add(payload: ChapterAddBookmarkPayload): Promise<BookmarkWithChapter> {
    const localSeriesId = this.library.resolveLocalSeriesId(payload.mangadexSeriesId);

    const tx = this.db.db.transaction(() => {
      // Upsert chapter row. Mirrors LibraryService.upsertProgressRow but
      // never touches read-progress fields (last_read_page / is_read /
      // read_at / page_count). COALESCE shields existing metadata from
      // being clobbered by a later bookmark call that lacks it.
      this.db.db
        .prepare(
          `INSERT INTO chapters (
             id, series_id, source, mangadex_chapter_id,
             chapter_number, volume_number, title,
             page_count, last_read_page, is_read
           ) VALUES (?, ?, 'mangadex', ?, ?, ?, ?, 0, 0, 0)
           ON CONFLICT(mangadex_chapter_id) DO UPDATE SET
             title = COALESCE(chapters.title, excluded.title),
             chapter_number = COALESCE(chapters.chapter_number, excluded.chapter_number),
             volume_number = COALESCE(chapters.volume_number, excluded.volume_number)`
        )
        .run(
          randomUUID(),
          localSeriesId,
          payload.mangadexChapterId,
          payload.chapterNumber ?? 0,
          payload.volumeNumber ?? null,
          payload.chapterTitle ?? null
        );

      const chapter = this.db.db
        .prepare('SELECT id FROM chapters WHERE mangadex_chapter_id = ?')
        .get(payload.mangadexChapterId) as { id: string } | undefined;
      if (!chapter) {
        throw new Error(
          `failed to upsert chapter row for bookmark (mangadexChapterId=${payload.mangadexChapterId})`
        );
      }

      this.db.db
        .prepare(
          `INSERT OR IGNORE INTO bookmarks (id, chapter_id, series_id, page, note, created_at)
           VALUES (?, ?, ?, ?, ?, datetime('now'))`
        )
        .run(randomUUID(), chapter.id, localSeriesId, payload.page, payload.note ?? null);
    });
    tx();

    const row = this.db.db
      .prepare(
        `SELECT
           b.id AS id,
           b.chapter_id AS chapter_id,
           b.series_id AS series_id,
           b.page AS page,
           b.note AS note,
           b.created_at AS created_at,
           c.mangadex_chapter_id AS c_mangadex_chapter_id,
           c.chapter_number AS c_chapter_number,
           c.volume_number AS c_volume_number,
           c.title AS c_title,
           s.mangadex_id AS s_mangadex_id
         FROM bookmarks b
         JOIN chapters c ON c.id = b.chapter_id
         JOIN series s ON s.id = b.series_id
         WHERE c.mangadex_chapter_id = ? AND b.page = ?`
      )
      .get(payload.mangadexChapterId, payload.page) as BookmarkJoinRow | undefined;

    if (!row) {
      throw new Error(
        `bookmark not found after insert (mangadexChapterId=${payload.mangadexChapterId}, page=${payload.page})`
      );
    }
    return this.rowToBookmark(row);
  }

  /**
   * Return every bookmark for a MangaDex-backed series, grouped by chapter
   * in natural reading order. Volumes sort first (nulls last), then chapters,
   * then page within a chapter.
   */
  async getForSeries(mangadexSeriesId: string): Promise<BookmarkWithChapter[]> {
    const rows = this.db.db
      .prepare(
        `SELECT
           b.id AS id,
           b.chapter_id AS chapter_id,
           b.series_id AS series_id,
           b.page AS page,
           b.note AS note,
           b.created_at AS created_at,
           c.mangadex_chapter_id AS c_mangadex_chapter_id,
           c.chapter_number AS c_chapter_number,
           c.volume_number AS c_volume_number,
           c.title AS c_title,
           s.mangadex_id AS s_mangadex_id
         FROM bookmarks b
         JOIN chapters c ON c.id = b.chapter_id
         JOIN series s ON s.id = b.series_id
         WHERE s.mangadex_id = ?
         ORDER BY (c.volume_number IS NULL), c.volume_number, c.chapter_number, b.page`
      )
      .all(mangadexSeriesId) as BookmarkJoinRow[];

    return rows.map(r => this.rowToBookmark(r));
  }

  /**
   * Delete a bookmark by id. Returns `success: true` when a row actually
   * disappeared, `false` otherwise (unknown id — not an error). Uses a
   * post-delete existence check so it works both on native better-sqlite3
   * (which reports `changes`) and the sql.js test adapter (which stubs 0).
   */
  async remove(bookmarkId: string): Promise<{ success: boolean }> {
    const existing = this.db.db.prepare('SELECT id FROM bookmarks WHERE id = ?').get(bookmarkId) as
      | { id: string }
      | undefined;
    if (!existing) {
      return { success: false };
    }
    this.db.db.prepare('DELETE FROM bookmarks WHERE id = ?').run(bookmarkId);
    return { success: true };
  }
}
