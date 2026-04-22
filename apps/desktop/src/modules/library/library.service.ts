import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createLogger } from '@kireimanga/shared';
import type {
  Series,
  ReadingStatus,
  ReaderSettings,
  ReaderMode,
  ReaderDirection,
  FitMode,
  ReaderUpdateProgressPayload,
  ReaderMarkReadPayload,
  LibraryChapterStatePatch,
  TranslationSettings,
} from '@kireimanga/shared';
import { DatabaseService } from '../database';
import { MangaDexService } from '../mangadex/mangadex.service';
import { SettingsService } from '../settings/settings.service';

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
  last_checked_at: string | null;
  new_chapter_count: number | null;
  local_root_path: string | null;
  local_content_hash: string | null;
  /** JSON-encoded `Partial<TranslationSettings>` (Slice A.4 migration 007). */
  translation_override: string | null;
  // Aggregated from the chapters table by `getAll()` only — other
  // single-row queries leave these NULL / undefined.
  last_chapter_number: number | null;
  total_chapter_count: number | null;
  read_chapter_count: number | null;
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
    private readonly mangadex: MangaDexService,
    private readonly settings: SettingsService
  ) {
    logger.info('LibraryService initialized');
  }

  /**
   * Resolve the current default reader prefs from user settings. Pulls the
   * three layout fields off `settings.reader` (which also carries `language`
   * — that field doesn't belong on `ReaderSettings` and is consumed by the
   * library/SeriesDetail layer separately).
   */
  private getReaderDefaults(): ReaderSettings {
    const fallback = this.settings.get().reader;
    return {
      mode: fallback.mode,
      direction: fallback.direction,
      fit: fallback.fit,
    };
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
      lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at) : undefined,
      newChapterCount: row.new_chapter_count ?? undefined,
      localRootPath: row.local_root_path ?? undefined,
      localContentHash: row.local_content_hash ?? undefined,
      lastChapterNumber: row.last_chapter_number ?? undefined,
      totalChapterCount: row.total_chapter_count ?? undefined,
      readChapterCount: row.read_chapter_count ?? undefined,
      translationOverride: parseTranslationOverride(row.translation_override),
    };
  }

  /**
   * Get effective reader preferences for a series. Stored NULL columns mean
   * "use the default", so they get merged with the user's reader defaults
   * (resolved from SettingsService — falls back to DEFAULT_READER_SETTINGS
   * if the user hasn't customised anything). If the series row doesn't
   * exist, defaults are returned verbatim.
   */
  async getReaderPrefs(seriesId: string): Promise<ReaderSettings> {
    const defaults = this.getReaderDefaults();
    const row = this.db.db
      .prepare('SELECT reader_mode, reader_direction, reader_fit FROM series WHERE id = ?')
      .get(seriesId) as
      | Pick<SeriesRow, 'reader_mode' | 'reader_direction' | 'reader_fit'>
      | undefined;
    if (!row) {
      return { ...defaults };
    }
    return {
      mode: row.reader_mode ?? defaults.mode,
      direction: row.reader_direction ?? defaults.direction,
      fit: row.reader_fit ?? defaults.fit,
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

    const row = this.db.db.prepare('SELECT * FROM series WHERE id = ?').get(seriesId) as
      | SeriesRow
      | undefined;
    return row ? this.rowToSeries(row) : null;
  }

  /**
   * Return every followed series, newest first. The LEFT JOIN hangs per-series
   * chapter counters off the row so the library list view can render
   * "last chapter" / "progress" columns without a second round-trip. Series
   * with no chapters yet get NULL aggregates (mapped to `undefined`), so the
   * frontend keeps rendering its em-dash placeholder.
   */
  async getAll(): Promise<Series[]> {
    const rows = this.db.db
      .prepare(
        `SELECT
           s.*,
           agg.last_chapter_number,
           agg.total_chapter_count,
           agg.read_chapter_count
         FROM series s
         LEFT JOIN (
           SELECT
             series_id,
             MAX(chapter_number) AS last_chapter_number,
             COUNT(*)            AS total_chapter_count,
             SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) AS read_chapter_count
           FROM chapters
           GROUP BY series_id
         ) AS agg ON agg.series_id = s.id
         ORDER BY s.added_at DESC`
      )
      .all() as SeriesRow[];
    return rows.map(r => this.rowToSeries(r));
  }

  /** Return a single series by id, or `null` if not found. */
  async getSeries(id: string): Promise<Series | null> {
    const row = this.db.db.prepare('SELECT * FROM series WHERE id = ?').get(id) as
      | SeriesRow
      | undefined;
    return row ? this.rowToSeries(row) : null;
  }

  /**
   * Follow a MangaDex series — idempotent on the `mangadex_id` UNIQUE index.
   * If a row already exists, it is returned unchanged; otherwise MangaDex is
   * queried for metadata and a new row is inserted with `status='reading'`.
   *
   * Race-safe: two concurrent callers both seeing no existing row will both
   * reach the INSERT; the second is absorbed by `INSERT OR IGNORE`, and the
   * post-insert lookup is keyed on `mangadex_id` so both callers resolve to
   * the same winning row.
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
        `INSERT OR IGNORE INTO series (id, title, title_japanese, cover_path, source, mangadex_id, status, added_at)
         VALUES (?, ?, ?, ?, 'mangadex', ?, 'reading', datetime('now'))`
      )
      .run(id, detail.title, detail.titleJapanese ?? null, detail.coverUrl ?? null, mangadexId);

    // Lookup by `mangadex_id` (not `id`) so a racing winner's row is returned
    // instead of throwing on a missed UUID.
    const inserted = this.db.db
      .prepare('SELECT * FROM series WHERE mangadex_id = ?')
      .get(mangadexId) as SeriesRow | undefined;
    if (!inserted) {
      throw new Error(`failed to insert series row (mangadexId=${mangadexId})`);
    }
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
    const row = this.db.db.prepare('SELECT * FROM series WHERE id = ?').get(id) as
      | SeriesRow
      | undefined;
    return row ? this.rowToSeries(row) : null;
  }

  /**
   * Resolve a MangaDex series id to the local `series.id`. Throws when the
   * user hasn't followed the series yet — callers that want auto-follow
   * semantics (reader progress / session start) should use
   * `resolveOrFollowLocalSeriesId` instead. The strict variant stays put for
   * callers where a miss is a real error (e.g. bookmarks — an explicit user
   * action on a series they must already be reading).
   * Public so sibling services (e.g. `BookmarkService`) can share the lookup.
   */
  resolveLocalSeriesId(mangadexSeriesId: string): string {
    const row = this.db.db
      .prepare('SELECT id FROM series WHERE mangadex_id = ?')
      .get(mangadexSeriesId) as { id: string } | undefined;
    if (!row) {
      throw new Error(`series not in library (mangadexId=${mangadexSeriesId})`);
    }
    return row.id;
  }

  /**
   * Reader-side variant of `resolveLocalSeriesId`: if the MangaDex series
   * isn't followed yet, auto-follow it (fetching metadata from MangaDex) and
   * return the freshly inserted row. Used by progress / session / mark-read
   * paths so opening a chapter from a search result silently adds the series
   * to the library instead of spamming "series not in library" toasts.
   *
   * Returns `{ localSeriesId, autoFollowed }` — `autoFollowed` is the new
   * series row on a miss-then-follow, or `null` on a cache hit. The gateway
   * uses `autoFollowed` to fire a `LibraryEvents.UPDATED` broadcast so the
   * web-side library store picks up the new entry without a full refetch.
   */
  async resolveOrFollowLocalSeriesId(
    mangadexSeriesId: string
  ): Promise<{ localSeriesId: string; autoFollowed: Series | null }> {
    const row = this.db.db
      .prepare('SELECT id FROM series WHERE mangadex_id = ?')
      .get(mangadexSeriesId) as { id: string } | undefined;
    if (row) {
      return { localSeriesId: row.id, autoFollowed: null };
    }

    logger.info(`auto-follow: ${mangadexSeriesId} not in library — following`);
    const series = await this.follow(mangadexSeriesId);
    return { localSeriesId: series.id, autoFollowed: series };
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
   * `series.last_read_at` and `series.last_chapter_id`. Auto-follows the
   * series if the user hasn't added it to the library yet; the caller can
   * key off `autoFollowed` to broadcast a library-updated event.
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
    autoFollowed: Series | null;
  }> {
    const { localSeriesId, autoFollowed } = await this.resolveOrFollowLocalSeriesId(
      payload.mangadexSeriesId
    );
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
      autoFollowed,
    };
  }

  /**
   * Mark a MangaDex chapter read in one shot — same upsert path as
   * `updateProgress` with `page = pageCount - 1` and `isRead = true`. Shares
   * the reader auto-follow behaviour with `updateProgress`.
   */
  async markChapterRead(payload: ReaderMarkReadPayload): Promise<{
    localSeriesId: string;
    chapter: {
      mangadexChapterId: string;
      lastReadPage: number;
      isRead: boolean;
      pageCount: number;
    };
    autoFollowed: Series | null;
  }> {
    const { localSeriesId, autoFollowed } = await this.resolveOrFollowLocalSeriesId(
      payload.mangadexSeriesId
    );
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
      autoFollowed,
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
        `SELECT mangadex_chapter_id, is_read, last_read_page, page_count, is_downloaded
         FROM chapters
         WHERE series_id = ? AND mangadex_chapter_id IN (${placeholders})`
      )
      .all(localSeriesId, ...mangadexChapterIds) as Array<{
      mangadex_chapter_id: string;
      is_read: number;
      last_read_page: number;
      page_count: number;
      is_downloaded: number;
    }>;

    const out: Record<string, LibraryChapterStatePatch> = {};
    for (const r of rows) {
      out[r.mangadex_chapter_id] = {
        isRead: r.is_read === 1,
        lastReadPage: r.last_read_page,
        pageCount: r.page_count,
        isDownloaded: r.is_downloaded === 1,
      };
    }
    return out;
  }

  /**
   * Open a reading session pinned to the local chapter row. If no chapter
   * row exists yet (user is opening this chapter for the first time), a
   * minimal row is inserted so the FK target is stable. Returns the new
   * session id plus the last known `last_read_page` so the renderer can
   * resume where the user left off.
   */
  async startSession(params: {
    mangadexSeriesId: string;
    mangadexChapterId: string;
  }): Promise<{ sessionId: string; startPage: number; autoFollowed: Series | null }> {
    const { localSeriesId, autoFollowed } = await this.resolveOrFollowLocalSeriesId(
      params.mangadexSeriesId
    );

    // Minimal upsert so there's always a chapter row to anchor sessions to.
    // Keeps chapter_number at its NOT NULL fallback of 0; a later
    // updateProgress / metadata fetch will backfill the real number.
    this.db.db
      .prepare(
        `INSERT OR IGNORE INTO chapters (
           id, series_id, source, mangadex_chapter_id,
           chapter_number, last_read_page, is_read, page_count
         ) VALUES (?, ?, 'mangadex', ?, 0, 0, 0, 0)`
      )
      .run(randomUUID(), localSeriesId, params.mangadexChapterId);

    const row = this.db.db
      .prepare('SELECT id, last_read_page FROM chapters WHERE mangadex_chapter_id = ?')
      .get(params.mangadexChapterId) as { id: string; last_read_page: number } | undefined;
    if (!row) {
      throw new Error('failed to upsert chapter row for session start');
    }

    const sessionId = randomUUID();
    this.db.db
      .prepare(
        `INSERT INTO reading_sessions (
           id, chapter_id, start_page, end_page,
           started_at, ended_at, duration_seconds
         ) VALUES (?, ?, ?, ?, datetime('now'), NULL, 0)`
      )
      .run(sessionId, row.id, row.last_read_page, row.last_read_page);

    return { sessionId, startPage: row.last_read_page, autoFollowed };
  }

  /**
   * Seal a reading session with its end page and duration. Always resolves
   * to `{ success: true }`; a missing session id logs a warning but doesn't
   * throw (the client already closed the reader).
   */
  async endSession(params: {
    sessionId: string;
    endPage: number;
    durationMs: number;
  }): Promise<{ success: boolean }> {
    const durationSeconds = Math.max(0, Math.round(params.durationMs / 1000));
    const result = this.db.db
      .prepare(
        `UPDATE reading_sessions
         SET end_page = ?, ended_at = datetime('now'), duration_seconds = ?
         WHERE id = ?`
      )
      .run(params.endPage, durationSeconds, params.sessionId);

    // better-sqlite3 returns { changes }; the sql.js test adapter stubs 0.
    // Log when we know for sure nothing matched (production path only).
    if (typeof result?.changes === 'number' && result.changes === 0) {
      logger.warn(`reader:session-end — no session matched id=${params.sessionId}`);
    }
    return { success: true };
  }

  /**
   * Reset the new-chapter badge for a series. Called when the user opens a
   * series detail page, signalling they've "seen" the update notification.
   */
  async markSeen(localSeriesId: string): Promise<void> {
    this.db.db.prepare('UPDATE series SET new_chapter_count = 0 WHERE id = ?').run(localSeriesId);
  }
}

/**
 * Decode the JSON blob stored in `series.translation_override` (Slice A.4).
 * Defensive: a malformed blob collapses to `undefined` so the renderer falls
 * back to global translation settings rather than crashing the row mapping.
 */
function parseTranslationOverride(
  raw: string | null
): Partial<TranslationSettings> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<TranslationSettings>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
