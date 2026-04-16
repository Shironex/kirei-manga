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
   * Record reading progress for a chapter. Slice B minimal path: bumps the
   * chapter's `last_read_page` and the series' `last_read_at`. Slice E owns
   * auto-marking chapters as read (`is_read` / `read_at`).
   */
  async updateProgress(id: string, chapterId: string, page: number): Promise<void> {
    const tx = this.db.db.transaction((seriesId: string, chId: string, pg: number) => {
      this.db.db
        .prepare('UPDATE chapters SET last_read_page = ? WHERE id = ? AND series_id = ?')
        .run(pg, chId, seriesId);
      this.db.db
        .prepare("UPDATE series SET last_read_at = datetime('now') WHERE id = ?")
        .run(seriesId);
    });
    tx(id, chapterId, page);
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
