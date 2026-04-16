import { Injectable, NotImplementedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createLogger } from '@kireimanga/shared';
import type {
  Series,
  ReadingStatus,
  Bookmark,
  ReaderSettings,
  ReaderMode,
  ReaderDirection,
  FitMode,
  ReaderUpdateProgressPayload,
  ReaderMarkReadPayload,
  LibraryChapterStatePatch,
} from '@kireimanga/shared';
import { DEFAULT_READER_SETTINGS } from '@kireimanga/shared';
import { DatabaseService } from '../database';
import { MangaDexService } from '../mangadex/mangadex.service';

const logger = createLogger('LibraryService');

/**
 * Raw `series` row shape as returned by better-sqlite3. Columns mirror the
 * v2 migration exactly; nullable columns surface as `null` (not `undefined`).
 */
interface SeriesRow {
  id: string;
  title: string;
  title_japanese: string | null;
  cover_path: string | null;
  source: 'local' | 'mangadex';
  mangadex_id: string | null;
  anilist_id: number | null;
  status: ReadingStatus;
  score: number | null;
  notes: string | null;
  added_at: string;
  last_read_at: string | null;
  reader_mode: ReaderMode | null;
  reader_direction: ReaderDirection | null;
  reader_fit: FitMode | null;
  last_chapter_id: string | null;
}

/**
 * Local library service — manages followed series, reading progress, and
 * bookmarks in SQLite. v0.1 covers follow/unfollow/status/progress; bookmarks
 * and mark-read land in Slice E.
 */
@Injectable()
export class LibraryService {
  constructor(
    private readonly db: DatabaseService,
    private readonly mangadex: MangaDexService
  ) {
    logger.info('LibraryService initialized');
  }

  /**
   * Map a raw `series` row to the shared `Series` domain type. `null` columns
   * collapse to `undefined` and ISO TEXT timestamps become `Date` instances.
   */
  private rowToSeries(row: SeriesRow): Series {
    return {
      id: row.id,
      title: row.title,
      titleJapanese: row.title_japanese ?? undefined,
      coverPath: row.cover_path ?? undefined,
      source: row.source,
      mangadexId: row.mangadex_id ?? undefined,
      anilistId: row.anilist_id ?? undefined,
      status: row.status,
      score: row.score ?? undefined,
      notes: row.notes ?? undefined,
      addedAt: new Date(row.added_at),
      lastReadAt: row.last_read_at ? new Date(row.last_read_at) : undefined,
      readerMode: row.reader_mode ?? undefined,
      readerDirection: row.reader_direction ?? undefined,
      readerFit: row.reader_fit ?? undefined,
      lastChapterId: row.last_chapter_id ?? undefined,
    };
  }

  /**
   * Get effective reader preferences for a series. Stored NULL columns mean
   * "use the default", so they get merged with `DEFAULT_READER_SETTINGS`.
   * If the series row doesn't exist, defaults are returned verbatim.
   */
  async getReaderPrefs(seriesId: string): Promise<ReaderSettings> {
    const row = this.db.db
      .prepare(
        'SELECT reader_mode, reader_direction, reader_fit FROM series WHERE id = ?'
      )
      .get(seriesId) as
      | Pick<SeriesRow, 'reader_mode' | 'reader_direction' | 'reader_fit'>
      | undefined;
    if (!row) {
      return { ...DEFAULT_READER_SETTINGS };
    }
    return {
      mode: row.reader_mode ?? DEFAULT_READER_SETTINGS.mode,
      direction: row.reader_direction ?? DEFAULT_READER_SETTINGS.direction,
      fit: row.reader_fit ?? DEFAULT_READER_SETTINGS.fit,
    };
  }

  /**
   * Partially update a series' reader prefs. Unspecified fields are preserved
   * via `COALESCE(?, existing)`. Returns the updated `Series` (with the new
   * prefs reflected on `readerMode/readerDirection/readerFit`), or `null` if
   * the row no longer exists.
   */
  async updateReaderPrefs(
    seriesId: string,
    prefs: Partial<ReaderSettings>
  ): Promise<Series | null> {
    this.db.db
      .prepare(
        `UPDATE series
         SET reader_mode = COALESCE(?, reader_mode),
             reader_direction = COALESCE(?, reader_direction),
             reader_fit = COALESCE(?, reader_fit)
         WHERE id = ?`
      )
      .run(prefs.mode ?? null, prefs.direction ?? null, prefs.fit ?? null, seriesId);

    const row = this.db.db
      .prepare('SELECT * FROM series WHERE id = ?')
      .get(seriesId) as SeriesRow | undefined;
    return row ? this.rowToSeries(row) : null;
  }

  /** Return every followed series, newest first. */
  async getAll(): Promise<Series[]> {
    const rows = this.db.db
      .prepare('SELECT * FROM series ORDER BY added_at DESC')
      .all() as SeriesRow[];
    return rows.map(r => this.rowToSeries(r));
  }

  /** Return a single series by id, or `null` if not found. */
  async getSeries(id: string): Promise<Series | null> {
    const row = this.db.db
      .prepare('SELECT * FROM series WHERE id = ?')
      .get(id) as SeriesRow | undefined;
    return row ? this.rowToSeries(row) : null;
  }

  /**
   * Follow a MangaDex series — idempotent on the `mangadex_id` UNIQUE index.
   * If a row already exists, it is returned unchanged; otherwise MangaDex is
   * queried for metadata and a new row is inserted with `status='reading'`.
   */
  async follow(mangadexId: string): Promise<Series> {
    const existing = this.db.db
      .prepare('SELECT * FROM series WHERE mangadex_id = ?')
      .get(mangadexId) as SeriesRow | undefined;
    if (existing) {
      return this.rowToSeries(existing);
    }

    const detail = await this.mangadex.getSeries(mangadexId);
    const id = randomUUID();

    this.db.db
      .prepare(
        `INSERT INTO series (id, title, title_japanese, cover_path, source, mangadex_id, status, added_at)
         VALUES (?, ?, ?, ?, 'mangadex', ?, 'reading', datetime('now'))`
      )
      .run(
        id,
        detail.title,
        detail.titleJapanese ?? null,
        detail.coverUrl ?? null,
        mangadexId
      );

    const inserted = this.db.db
      .prepare('SELECT * FROM series WHERE id = ?')
      .get(id) as SeriesRow;
    return this.rowToSeries(inserted);
  }

  /**
   * Unfollow a series. `ON DELETE CASCADE` on `chapters`, `bookmarks`, and
   * `reading_sessions` drops dependents automatically.
   */
  async unfollow(id: string): Promise<void> {
    this.db.db.prepare('DELETE FROM series WHERE id = ?').run(id);
  }

  /**
   * Update a series' reading status. Returns the updated row, or `null` if
   * no row matched (e.g. the user unfollowed it concurrently).
   */
  async updateStatus(id: string, status: ReadingStatus): Promise<Series | null> {
    this.db.db.prepare('UPDATE series SET status = ? WHERE id = ?').run(status, id);
    const row = this.db.db
      .prepare('SELECT * FROM series WHERE id = ?')
      .get(id) as SeriesRow | undefined;
    return row ? this.rowToSeries(row) : null;
  }

  /**
   * Resolve a MangaDex series id to the local `series.id`. Throws when the
   * user hasn't followed the series yet — the reader never talks to MangaDex
   * directly for progress updates, so a miss here is a genuine error.
   */
  private resolveLocalSeriesId(mangadexSeriesId: string): string {
    const row = this.db.db
      .prepare('SELECT id FROM series WHERE mangadex_id = ?')
      .get(mangadexSeriesId) as { id: string } | undefined;
    if (!row) {
      throw new Error(`series not in library (mangadexId=${mangadexSeriesId})`);
    }
    return row.id;
  }

  /**
   * Upsert a chapter row for the given progress update, keyed on
   * `mangadex_chapter_id`. `last_read_page` overwrites (renderer is source of
   * truth for current page), `page_count` takes the max (protects against a
   * renderer that reports a short count before images finish resolving), and
   * `is_read` monotonically rises (OR). Fixed columns like chapter_number /
   * volume_number / title use COALESCE so we don't clobber real metadata with
   * incidental nulls from a later progress tick.
   */
  private upsertProgressRow(params: {
    localSeriesId: string;
    mangadexChapterId: string;
    page: number;
    pageCount: number;
    isRead: boolean;
    chapterNumber?: number;
    volumeNumber?: number;
    title?: string;
  }): void {
    const {
      localSeriesId,
      mangadexChapterId,
      page,
      pageCount,
      isRead,
      chapterNumber,
      volumeNumber,
      title,
    } = params;

    this.db.db
      .prepare(
        `INSERT INTO chapters (
           id, series_id, source, mangadex_chapter_id,
           chapter_number, volume_number, title,
           page_count, last_read_page, is_read, read_at
         ) VALUES (?, ?, 'mangadex', ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(mangadex_chapter_id) DO UPDATE SET
           last_read_page = excluded.last_read_page,
           page_count = MAX(chapters.page_count, excluded.page_count),
           is_read = excluded.is_read OR chapters.is_read,
           read_at = CASE
             WHEN excluded.is_read = 1
               THEN COALESCE(chapters.read_at, excluded.read_at)
             ELSE chapters.read_at
           END,
           title = COALESCE(chapters.title, excluded.title),
           chapter_number = COALESCE(chapters.chapter_number, excluded.chapter_number),
           volume_number = COALESCE(chapters.volume_number, excluded.volume_number)`
      )
      .run(
        randomUUID(),
        localSeriesId,
        mangadexChapterId,
        chapterNumber ?? 0,
        volumeNumber ?? null,
        title ?? null,
        pageCount,
        page,
        isRead ? 1 : 0,
        isRead ? new Date().toISOString() : null
      );
  }

  /**
   * Record reader progress for a MangaDex chapter. Upserts a chapters row,
   * auto-marks the chapter read when `page >= pageCount - 1`, and bumps both
   * `series.last_read_at` and `series.last_chapter_id`. Throws if the series
   * isn't in the library.
   */
  async updateProgress(payload: ReaderUpdateProgressPayload): Promise<{
    isRead: boolean;
    chapter: {
      mangadexChapterId: string;
      lastReadPage: number;
      isRead: boolean;
      pageCount: number;
    };
    localSeriesId: string;
  }> {
    const localSeriesId = this.resolveLocalSeriesId(payload.mangadexSeriesId);
    const isRead = payload.page >= payload.pageCount - 1;

    const tx = this.db.db.transaction(() => {
      this.upsertProgressRow({
        localSeriesId,
        mangadexChapterId: payload.mangadexChapterId,
        page: payload.page,
        pageCount: payload.pageCount,
        isRead,
        chapterNumber: payload.chapterNumber,
        volumeNumber: payload.volumeNumber,
        title: payload.title,
      });
      this.db.db
        .prepare(
          "UPDATE series SET last_read_at = datetime('now'), last_chapter_id = ? WHERE id = ?"
        )
        .run(payload.mangadexChapterId, localSeriesId);
    });
    tx();

    return {
      isRead,
      chapter: {
        mangadexChapterId: payload.mangadexChapterId,
        lastReadPage: payload.page,
        isRead,
        pageCount: payload.pageCount,
      },
      localSeriesId,
    };
  }

  /**
   * Mark a MangaDex chapter read in one shot — same upsert path as
   * `updateProgress` with `page = pageCount - 1` and `isRead = true`.
   */
  async markChapterRead(payload: ReaderMarkReadPayload): Promise<{
    localSeriesId: string;
    chapter: {
      mangadexChapterId: string;
      lastReadPage: number;
      isRead: boolean;
      pageCount: number;
    };
  }> {
    const localSeriesId = this.resolveLocalSeriesId(payload.mangadexSeriesId);
    const lastReadPage = Math.max(0, payload.pageCount - 1);

    const tx = this.db.db.transaction(() => {
      this.upsertProgressRow({
        localSeriesId,
        mangadexChapterId: payload.mangadexChapterId,
        page: lastReadPage,
        pageCount: payload.pageCount,
        isRead: true,
        chapterNumber: payload.chapterNumber,
        volumeNumber: payload.volumeNumber,
        title: payload.title,
      });
      this.db.db
        .prepare(
          "UPDATE series SET last_read_at = datetime('now'), last_chapter_id = ? WHERE id = ?"
        )
        .run(payload.mangadexChapterId, localSeriesId);
    });
    tx();

    return {
      localSeriesId,
      chapter: {
        mangadexChapterId: payload.mangadexChapterId,
        lastReadPage,
        isRead: true,
        pageCount: payload.pageCount,
      },
    };
  }

  /**
   * Bulk lookup of chapter read-state patches for rendering chapter lists.
   * Returns a map keyed by `mangadex_chapter_id`; chapters with no row are
   * simply absent from the map (caller treats as unread at page 0).
   */
  async getChapterStates(
    localSeriesId: string,
    mangadexChapterIds: string[]
  ): Promise<Record<string, LibraryChapterStatePatch>> {
    if (mangadexChapterIds.length === 0) {
      return {};
    }
    const placeholders = mangadexChapterIds.map(() => '?').join(', ');
    const rows = this.db.db
      .prepare(
        `SELECT mangadex_chapter_id, is_read, last_read_page, page_count
         FROM chapters
         WHERE series_id = ? AND mangadex_chapter_id IN (${placeholders})`
      )
      .all(localSeriesId, ...mangadexChapterIds) as Array<{
      mangadex_chapter_id: string;
      is_read: number;
      last_read_page: number;
      page_count: number;
    }>;

    const out: Record<string, LibraryChapterStatePatch> = {};
    for (const r of rows) {
      out[r.mangadex_chapter_id] = {
        isRead: r.is_read === 1,
        lastReadPage: r.last_read_page,
        pageCount: r.page_count,
      };
    }
    return out;
  }

  async addBookmark(_chapterId: string, _page: number, _note?: string): Promise<Bookmark> {
    throw new NotImplementedException('chapter:add-bookmark not implemented yet');
  }

  async getBookmarks(_chapterId: string): Promise<Bookmark[]> {
    throw new NotImplementedException('chapter:get-bookmarks not implemented yet');
  }
}
