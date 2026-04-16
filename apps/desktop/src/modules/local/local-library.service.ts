import { Injectable } from '@nestjs/common';
import { randomUUID, createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import {
  createLogger,
  type Chapter,
  type LocalArchiveFormat,
  type LocalImportPayload,
  type LocalImportResponse,
  type LocalSeriesMetaPatch,
  type LocalChapterMetaPatch,
  type ScanCandidateSeries,
  type Series,
} from '@kireimanga/shared';
import { DatabaseService } from '../database';
import { openArchive, type PageEntry } from './archive';

const logger = createLogger('LocalLibraryService');

/**
 * Resolve the on-disk cover root for local series. Mirrors the pages cache
 * resolver — absolute path under `userData/covers/local/` in Electron,
 * falls back to `.userData/covers/local` in Jest so tests can run without
 * an Electron shim.
 */
export function getLocalCoverRoot(): string {
  try {
    return path.join(app.getPath('userData'), 'covers', 'local');
  } catch {
    return path.join(process.cwd(), '.userData', 'covers', 'local');
  }
}

/**
 * Deterministic dedup key for a local series import. Lets the import step
 * detect an "already imported this root" case without re-walking the
 * filesystem. Only the *set* of chapters matters — order stability comes
 * from sorting the relative paths.
 */
export function computeLocalContentHash(
  candidate: Pick<ScanCandidateSeries, 'chapters'>
): string {
  const paths = candidate.chapters.map(c => c.relativePath).sort();
  const hash = createHash('sha1');
  for (const p of paths) {
    hash.update(p);
    hash.update('\n');
  }
  return hash.digest('hex');
}

function clampScore(value: number | undefined): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 10) return null;
  return rounded;
}

/**
 * Extract the first page of a chapter and write it to `targetPath`
 * atomically (tmp file + rename). Falls back to the first entry by natural
 * order. Returns the final extension used so the caller can record it in
 * the cover URL.
 */
async function extractCover(
  archivePath: string,
  format: ScanCandidateSeries['chapters'][number]['format'],
  targetDir: string
): Promise<{ file: string; ext: string } | null> {
  const reader = await openArchive(archivePath, format);
  try {
    const pages = await reader.listPages();
    if (pages.length === 0) return null;
    const first = pages[0];
    const { data } = await reader.readPage(first);
    await fs.mkdir(targetDir, { recursive: true });
    const file = `cover.${first.ext}`;
    const finalPath = path.join(targetDir, file);
    const tmpPath = `${finalPath}.tmp`;
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, finalPath);
    return { file, ext: first.ext };
  } finally {
    await reader.close();
  }
}

interface LocalSeriesChapterRow {
  id: string;
  title: string | null;
  chapter_number: number | null;
  volume_number: number | null;
  local_path: string;
  local_archive_format: string;
  page_count: number;
}

/**
 * Raw archive pointer for a local chapter. Exposed so the `kirei-page://`
 * protocol and the `local:get-pages` handler can resolve the chapter's
 * on-disk location without talking to SQLite directly.
 */
export interface LocalChapterArchive {
  localPath: string;
  format: 'folder' | 'cbz' | 'cbr' | 'zip';
}

/**
 * Owns write paths into the local half of the library. Companion to
 * `LibraryService` — that one is MangaDex-centric and existed before v0.2;
 * this one carries the local-source-specific logic (content-hash dedup,
 * cover extraction, archive-format-aware chapter rows). They both read
 * from the same `series` / `chapters` tables, and the library renderer
 * queries via the existing `library:*` channels to stay source-agnostic.
 */
@Injectable()
export class LocalLibraryService {
  constructor(private readonly db: DatabaseService) {
    logger.info('LocalLibraryService initialized');
  }

  /**
   * Commit a user-confirmed scan proposal into SQLite. Transactional per
   * series — a cover-extraction failure for one series rolls back just that
   * series, letting the rest of the batch succeed. Returns the local ids of
   * the successfully-created series and the count of deduped / failed
   * entries for the UI to report.
   */
  async import(payload: LocalImportPayload): Promise<LocalImportResponse> {
    const createdSeriesIds: string[] = [];
    let skipped = 0;

    for (const candidate of payload.candidates) {
      const seriesId = randomUUID();
      const contentHash = computeLocalContentHash(candidate);

      const existing = this.db.db
        .prepare('SELECT id FROM series WHERE local_content_hash = ?')
        .get(contentHash) as { id: string } | undefined;
      if (existing) {
        skipped += 1;
        continue;
      }

      let coverUrl: string | null = null;
      try {
        const primary = candidate.chapters[0];
        if (primary) {
          const coverDir = path.join(getLocalCoverRoot(), seriesId);
          const extracted = await extractCover(
            path.join(candidate.absolutePath, primary.relativePath),
            primary.format,
            coverDir
          );
          if (extracted) {
            coverUrl = `kirei-cover://local/${seriesId}/${extracted.file}`;
          }
        }
      } catch (err) {
        logger.warn(
          `import: cover extraction failed for ${candidate.suggestedTitle}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }

      const tx = this.db.db.transaction(() => {
        this.db.db
          .prepare(
            `INSERT INTO series (
               id, title, source, status,
               cover_path, local_root_path, local_content_hash, added_at
             ) VALUES (?, ?, 'local', 'reading', ?, ?, ?, datetime('now'))`
          )
          .run(
            seriesId,
            candidate.suggestedTitle,
            coverUrl,
            candidate.absolutePath,
            contentHash
          );

        for (const chapter of candidate.chapters) {
          this.db.db
            .prepare(
              `INSERT INTO chapters (
                 id, series_id, source,
                 chapter_number, volume_number,
                 local_path, local_archive_format, page_count,
                 is_downloaded, is_read, last_read_page
               ) VALUES (?, ?, 'local', ?, ?, ?, ?, ?, 1, 0, 0)`
            )
            .run(
              randomUUID(),
              seriesId,
              chapter.chapterNumber ?? 0,
              chapter.volumeNumber ?? null,
              path.join(candidate.absolutePath, chapter.relativePath),
              chapter.format,
              chapter.pageCount
            );
        }
      });

      try {
        tx();
        createdSeriesIds.push(seriesId);
      } catch (err) {
        logger.error(
          `import: transaction failed for ${candidate.suggestedTitle}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        skipped += 1;
      }
    }

    return { createdSeriesIds, skipped };
  }

  /**
   * Merge a metadata patch into an existing local series. Null / undefined
   * fields are preserved via `COALESCE(?, existing_value)`. Returns the
   * updated row or `null` if no row matched.
   */
  async updateSeries(id: string, patch: LocalSeriesMetaPatch): Promise<Series | null> {
    this.db.db
      .prepare(
        `UPDATE series
         SET title = COALESCE(?, title),
             title_japanese = COALESCE(?, title_japanese),
             notes = COALESCE(?, notes),
             score = COALESCE(?, score),
             cover_path = COALESCE(?, cover_path)
         WHERE id = ? AND source = 'local'`
      )
      .run(
        patch.title ?? null,
        patch.titleJapanese ?? null,
        patch.notes ?? null,
        clampScore(patch.score),
        patch.coverPath ?? null,
        id
      );
    return this.getSeries(id);
  }

  async updateChapter(chapterId: string, patch: LocalChapterMetaPatch): Promise<boolean> {
    this.db.db
      .prepare(
        `UPDATE chapters
         SET chapter_number = COALESCE(?, chapter_number),
             volume_number = COALESCE(?, volume_number),
             title = COALESCE(?, title)
         WHERE id = ? AND source = 'local'`
      )
      .run(
        patch.chapterNumber ?? null,
        patch.volumeNumber ?? null,
        patch.title ?? null,
        chapterId
      );
    return true;
  }

  /**
   * Delete a local series and cascade (chapters / bookmarks / reading
   * sessions drop via ON DELETE CASCADE). Also tries to unlink the cover
   * file on disk — a failure there is logged but not fatal since the row
   * is the source of truth.
   */
  async deleteSeries(id: string): Promise<boolean> {
    this.db.db.prepare("DELETE FROM series WHERE id = ? AND source = 'local'").run(id);
    try {
      const coverDir = path.join(getLocalCoverRoot(), id);
      await fs.rm(coverDir, { recursive: true, force: true });
    } catch (err) {
      logger.warn(
        `deleteSeries: failed to remove cover dir for ${id}: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    return true;
  }

  /**
   * Fetch a local series by id. Returns null when the row was unfollowed
   * concurrently. Shape matches `Series` so it can flow through the
   * existing library cache in the renderer.
   */
  async getSeries(id: string): Promise<Series | null> {
    const row = this.db.db
      .prepare("SELECT * FROM series WHERE id = ? AND source = 'local'")
      .get(id) as Record<string, unknown> | undefined;
    if (!row) return null;

    return {
      id: row.id as string,
      title: row.title as string,
      titleJapanese: (row.title_japanese as string | null) ?? undefined,
      coverPath: (row.cover_path as string | null) ?? undefined,
      source: 'local',
      status: row.status as Series['status'],
      score: (row.score as number | null) ?? undefined,
      notes: (row.notes as string | null) ?? undefined,
      addedAt: new Date(row.added_at as string),
      lastReadAt: row.last_read_at ? new Date(row.last_read_at as string) : undefined,
      localRootPath: (row.local_root_path as string | null) ?? undefined,
      localContentHash: (row.local_content_hash as string | null) ?? undefined,
    };
  }

  /**
   * List chapters for a local series. Ordered by volume / chapter / title
   * so the UI doesn't have to re-sort. Chapters without numbers fall to
   * the end.
   */
  async getChapters(seriesId: string): Promise<LocalSeriesChapterRow[]> {
    return this.db.db
      .prepare(
        `SELECT id, title, chapter_number, volume_number, local_path,
                local_archive_format, page_count
         FROM chapters
         WHERE series_id = ? AND source = 'local'
         ORDER BY COALESCE(volume_number, 9999),
                  COALESCE(chapter_number, 9999),
                  title`
      )
      .all(seriesId) as LocalSeriesChapterRow[];
  }

  /**
   * Return the shared `Chapter[]` shape for a local series. Mirrors
   * `getChapters` but resolves every field the renderer expects on a
   * `Chapter` — including the `isRead / lastReadPage` fields that come
   * from progress tracking. Kept separate from `getChapters` so the page
   * protocol's raw-row getter stays narrow.
   */
  async getChaptersForRenderer(seriesId: string): Promise<Chapter[]> {
    const rows = this.db.db
      .prepare(
        `SELECT id, title, chapter_number, volume_number, local_path,
                local_archive_format, page_count, is_downloaded, is_read,
                last_read_page, read_at
         FROM chapters
         WHERE series_id = ? AND source = 'local'
         ORDER BY COALESCE(volume_number, 9999),
                  COALESCE(chapter_number, 9999),
                  title`
      )
      .all(seriesId) as Array<{
      id: string;
      title: string | null;
      chapter_number: number | null;
      volume_number: number | null;
      local_path: string | null;
      local_archive_format: string | null;
      page_count: number;
      is_downloaded: number;
      is_read: number;
      last_read_page: number;
      read_at: string | null;
    }>;

    return rows.map(r => ({
      id: r.id,
      seriesId,
      title: r.title ?? undefined,
      chapterNumber: r.chapter_number ?? 0,
      volumeNumber: r.volume_number ?? undefined,
      source: 'local',
      localPath: r.local_path ?? undefined,
      localArchiveFormat: (r.local_archive_format as LocalArchiveFormat) ?? undefined,
      pageCount: r.page_count,
      isDownloaded: r.is_downloaded === 1,
      isRead: r.is_read === 1,
      lastReadPage: r.last_read_page,
      readAt: r.read_at ? new Date(r.read_at) : undefined,
    }));
  }

  /**
   * Resolve a local chapter id to its on-disk archive pointer. Returns
   * `null` when the id isn't a local chapter (either unknown or pointing
   * at a MangaDex row). The `kirei-page://local/` protocol calls this on
   * every page request — cheap point lookup, indexed via PRIMARY KEY.
   */
  getChapterArchive(chapterId: string): LocalChapterArchive | null {
    const row = this.db.db
      .prepare(
        `SELECT local_path, local_archive_format
         FROM chapters
         WHERE id = ? AND source = 'local'`
      )
      .get(chapterId) as
      | { local_path: string | null; local_archive_format: string | null }
      | undefined;
    if (!row || !row.local_path || !row.local_archive_format) return null;
    return {
      localPath: row.local_path,
      format: row.local_archive_format as LocalChapterArchive['format'],
    };
  }

  /**
   * List the archive's page entries in reading order. The protocol and
   * `local:get-pages` handler both walk this list — one to resolve by
   * index, the other to build page URLs. Opens and closes the archive for
   * each call; for sustained page-by-page reads a future slice can add a
   * small reader cache if perf demands it.
   */
  async listChapterPages(chapterId: string): Promise<PageEntry[] | null> {
    const archive = this.getChapterArchive(chapterId);
    if (!archive) return null;
    const reader = await openArchive(archive.localPath, archive.format);
    try {
      return await reader.listPages();
    } finally {
      await reader.close();
    }
  }

  /**
   * Record a reader progress tick for a local chapter. Writes
   * `last_read_page` (overwrites — renderer is source of truth for current
   * page) and `page_count` (takes the max so a short early report doesn't
   * shrink a known total). Flips `is_read` when the reader crosses the
   * final page. Series `last_read_at` + `last_chapter_id` get bumped so
   * the library's "Continue" link works the same way it does for mangadex.
   * Returns the resolved read state so the gateway can broadcast it.
   */
  async recordProgress(params: {
    localSeriesId: string;
    localChapterId: string;
    page: number;
    pageCount: number;
  }): Promise<{ isRead: boolean }> {
    const isRead = params.page >= Math.max(0, params.pageCount - 1);

    const tx = this.db.db.transaction(() => {
      this.db.db
        .prepare(
          `UPDATE chapters
           SET last_read_page = ?,
               page_count = MAX(page_count, ?),
               is_read = ? OR is_read,
               read_at = CASE
                 WHEN ? = 1 THEN COALESCE(read_at, ?)
                 ELSE read_at
               END
           WHERE id = ? AND source = 'local'`
        )
        .run(
          params.page,
          params.pageCount,
          isRead ? 1 : 0,
          isRead ? 1 : 0,
          new Date().toISOString(),
          params.localChapterId
        );

      this.db.db
        .prepare(
          "UPDATE series SET last_read_at = datetime('now'), last_chapter_id = ? WHERE id = ? AND source = 'local'"
        )
        .run(params.localChapterId, params.localSeriesId);
    });
    tx();

    return { isRead };
  }

  /**
   * Point lookup for the reader's resume-on-open flow. Returns
   * `last_read_page` from the chapter row, or 0 if the chapter hasn't
   * been touched. Missing rows collapse to 0 as well — the reader treats
   * that as "start from the beginning" which is correct for unknown ids.
   */
  getChapterResumePage(chapterId: string): number {
    const row = this.db.db
      .prepare(
        "SELECT last_read_page FROM chapters WHERE id = ? AND source = 'local'"
      )
      .get(chapterId) as { last_read_page: number } | undefined;
    return row?.last_read_page ?? 0;
  }

  /**
   * Read a specific page from a local chapter's archive. `pageIndex` is
   * the 0-based position in `listChapterPages(chapterId)` — callers that
   * shouldn't care about filename encoding (e.g. the `kirei-page://`
   * protocol) pass an index, not a name. Returns `null` for unknown
   * chapters or out-of-range indices.
   */
  async readChapterPage(
    chapterId: string,
    pageIndex: number
  ): Promise<{ data: Buffer; mime: string } | null> {
    if (!Number.isInteger(pageIndex) || pageIndex < 0) return null;
    const archive = this.getChapterArchive(chapterId);
    if (!archive) return null;
    const reader = await openArchive(archive.localPath, archive.format);
    try {
      const pages = await reader.listPages();
      const entry = pages[pageIndex];
      if (!entry) return null;
      return await reader.readPage(entry);
    } finally {
      await reader.close();
    }
  }
}
