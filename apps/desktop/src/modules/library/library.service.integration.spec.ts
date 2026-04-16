import type { MangaDexSeriesDetail } from '@kireimanga/shared';
import { LibraryService } from './library.service';
import type { DatabaseService } from '../database';
import type { MangaDexService } from '../mangadex/mangadex.service';
import {
  createTestDatabase,
  type CompatDatabase,
} from '../database/__test__/sqljs-adapter';

/**
 * Integration test: LibraryService against a real in-memory SQLite DB
 * (sql.js under the hood — see `sqljs-adapter.ts` for why we don't use
 * native better-sqlite3 in Jest) with the production migrations applied.
 * MangaDexService is mocked — this is a service-layer test (no socket,
 * no gateway).
 *
 * Stand-in DatabaseService: opens an in-memory DB, runs migrations, exposes
 * the same `db` getter LibraryService consumes. Simpler and more robust
 * than overriding via `Test.createTestingModule` since LibraryService only
 * touches `this.db.db` and `this.mangadex.getSeries`.
 */

function buildDetailFixture(
  overrides: Partial<MangaDexSeriesDetail> = {}
): MangaDexSeriesDetail {
  return {
    id: 'mxid-1',
    title: 'Fixture Title',
    titleJapanese: 'フィクスチャ',
    alternativeTitles: [],
    description: '',
    coverUrl: 'kirei-cover://mangadex/mxid-1/cover.jpg.512.jpg',
    bannerUrl: 'kirei-cover://mangadex/mxid-1/cover.jpg',
    status: 'ongoing',
    contentRating: 'safe',
    demographic: 'none',
    tags: [],
    availableTranslatedLanguages: [],
    ...overrides,
  };
}

describe('LibraryService (integration)', () => {
  let db: CompatDatabase;
  let dbService: DatabaseService;
  let mangadex: { getSeries: jest.Mock };
  let service: LibraryService;

  beforeEach(async () => {
    db = await createTestDatabase();

    // Stand-in DatabaseService — LibraryService only uses `this.db.db`.
    dbService = { db } as unknown as DatabaseService;

    mangadex = {
      getSeries: jest.fn().mockResolvedValue(buildDetailFixture()),
    };

    service = new LibraryService(dbService, mangadex as unknown as MangaDexService);
  });

  afterEach(() => {
    db.close();
  });

  describe('follow', () => {
    it('inserts a new series row and returns the stored Series', async () => {
      const series = await service.follow('mxid-1');

      expect(series.id).toBeDefined();
      expect(series.id).not.toBe('mxid-1');
      expect(series.mangadexId).toBe('mxid-1');
      expect(series.source).toBe('mangadex');
      expect(series.status).toBe('reading');
      expect(series.title).toBe('Fixture Title');
      expect(series.addedAt).toBeInstanceOf(Date);
    });

    it('is idempotent — re-follow returns the same id without re-fetching MangaDex', async () => {
      const first = await service.follow('mxid-1');
      const second = await service.follow('mxid-1');

      expect(second.id).toBe(first.id);
      expect(mangadex.getSeries).toHaveBeenCalledTimes(1);

      const all = await service.getAll();
      expect(all).toHaveLength(1);
    });
  });

  describe('getAll / getSeries', () => {
    it('getAll reflects a followed series', async () => {
      const followed = await service.follow('mxid-1');
      const all = await service.getAll();

      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(followed.id);
      expect(all[0].mangadexId).toBe('mxid-1');
    });

    it('getSeries returns the row by local id', async () => {
      const followed = await service.follow('mxid-1');
      const found = await service.getSeries(followed.id);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(followed.id);
      expect(found!.title).toBe('Fixture Title');
    });

    it('getSeries returns null for an unknown id', async () => {
      const found = await service.getSeries('does-not-exist');
      expect(found).toBeNull();
    });
  });

  describe('unfollow', () => {
    it('removes the row and leaves getAll empty', async () => {
      const followed = await service.follow('mxid-1');

      await service.unfollow(followed.id);

      expect(await service.getAll()).toHaveLength(0);
      expect(await service.getSeries(followed.id)).toBeNull();
    });

    it('does not throw when unfollowing a non-existent id', async () => {
      await expect(service.unfollow('does-not-exist')).resolves.toBeUndefined();
      expect(await service.getAll()).toHaveLength(0);
    });
  });

  describe('updateStatus', () => {
    it('updates the status and returns the updated Series', async () => {
      const followed = await service.follow('mxid-1');

      const updated = await service.updateStatus(followed.id, 'completed');

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('completed');

      const reread = await service.getSeries(followed.id);
      expect(reread!.status).toBe('completed');
    });

    it('returns null for an unknown id', async () => {
      const updated = await service.updateStatus('missing', 'completed');
      expect(updated).toBeNull();
    });
  });

  describe('reader preferences', () => {
    it('getReaderPrefs returns DEFAULT_READER_SETTINGS for a freshly followed series', async () => {
      const followed = await service.follow('mxid-1');

      const prefs = await service.getReaderPrefs(followed.id);

      expect(prefs).toEqual({ mode: 'single', direction: 'rtl', fit: 'width' });
    });

    it('updateReaderPrefs persists a partial change and returns the updated Series', async () => {
      const followed = await service.follow('mxid-1');

      const updated = await service.updateReaderPrefs(followed.id, { mode: 'webtoon' });

      expect(updated).not.toBeNull();
      expect(updated!.readerMode).toBe('webtoon');
      expect(updated!.readerDirection).toBeUndefined();
      expect(updated!.readerFit).toBeUndefined();
    });

    it('getReaderPrefs merges stored values with defaults for unset fields', async () => {
      const followed = await service.follow('mxid-1');
      await service.updateReaderPrefs(followed.id, { mode: 'webtoon' });

      const prefs = await service.getReaderPrefs(followed.id);

      expect(prefs).toEqual({ mode: 'webtoon', direction: 'rtl', fit: 'width' });
    });

    it('updateReaderPrefs returns null for an unknown series id', async () => {
      const updated = await service.updateReaderPrefs('does-not-exist', { mode: 'double' });
      expect(updated).toBeNull();
    });
  });

  describe('reading progress', () => {
    it('updateProgress upserts a chapter row and bumps the series', async () => {
      await service.follow('mxid-1');

      const result = await service.updateProgress({
        mangadexSeriesId: 'mxid-1',
        mangadexChapterId: 'ch-1',
        page: 3,
        pageCount: 20,
      });

      expect(result.isRead).toBe(false);
      expect(result.chapter).toEqual({
        mangadexChapterId: 'ch-1',
        lastReadPage: 3,
        isRead: false,
        pageCount: 20,
      });

      const chapter = db
        .prepare(
          'SELECT last_read_page, is_read, read_at FROM chapters WHERE mangadex_chapter_id = ?'
        )
        .get('ch-1') as
        | { last_read_page: number; is_read: number; read_at: string | null }
        | undefined;
      expect(chapter).toBeDefined();
      expect(chapter!.last_read_page).toBe(3);
      expect(chapter!.is_read).toBe(0);
      expect(chapter!.read_at).toBeNull();

      const seriesRow = db
        .prepare(
          'SELECT last_read_at, last_chapter_id FROM series WHERE mangadex_id = ?'
        )
        .get('mxid-1') as { last_read_at: string | null; last_chapter_id: string | null };
      expect(seriesRow.last_read_at).not.toBeNull();
      expect(seriesRow.last_chapter_id).toBe('ch-1');
    });

    it('updateProgress auto-marks a chapter read at the final page', async () => {
      await service.follow('mxid-1');
      await service.updateProgress({
        mangadexSeriesId: 'mxid-1',
        mangadexChapterId: 'ch-1',
        page: 3,
        pageCount: 20,
      });

      const result = await service.updateProgress({
        mangadexSeriesId: 'mxid-1',
        mangadexChapterId: 'ch-1',
        page: 19,
        pageCount: 20,
      });

      expect(result.isRead).toBe(true);
      const chapter = db
        .prepare(
          'SELECT is_read, read_at, last_read_page FROM chapters WHERE mangadex_chapter_id = ?'
        )
        .get('ch-1') as {
        is_read: number;
        read_at: string | null;
        last_read_page: number;
      };
      expect(chapter.is_read).toBe(1);
      expect(chapter.read_at).not.toBeNull();
      expect(chapter.last_read_page).toBe(19);
    });

    it('markChapterRead upserts a read chapter in one shot', async () => {
      await service.follow('mxid-1');

      const result = await service.markChapterRead({
        mangadexSeriesId: 'mxid-1',
        mangadexChapterId: 'ch-2',
        pageCount: 10,
      });

      expect(result.chapter.isRead).toBe(true);
      expect(result.chapter.lastReadPage).toBe(9);

      const chapter = db
        .prepare(
          'SELECT is_read, last_read_page FROM chapters WHERE mangadex_chapter_id = ?'
        )
        .get('ch-2') as { is_read: number; last_read_page: number };
      expect(chapter.is_read).toBe(1);
      expect(chapter.last_read_page).toBe(9);
    });

    it('getChapterStates returns a map of only known chapters', async () => {
      const followed = await service.follow('mxid-1');
      await service.updateProgress({
        mangadexSeriesId: 'mxid-1',
        mangadexChapterId: 'ch-1',
        page: 3,
        pageCount: 20,
      });
      await service.markChapterRead({
        mangadexSeriesId: 'mxid-1',
        mangadexChapterId: 'ch-2',
        pageCount: 10,
      });

      const states = await service.getChapterStates(followed.id, [
        'ch-1',
        'ch-2',
        'ch-missing',
      ]);

      expect(Object.keys(states).sort()).toEqual(['ch-1', 'ch-2']);
      expect(states['ch-1']).toEqual({ isRead: false, lastReadPage: 3, pageCount: 20 });
      expect(states['ch-2']).toEqual({ isRead: true, lastReadPage: 9, pageCount: 10 });
    });

    it('getChapterStates returns {} for an empty id list', async () => {
      const followed = await service.follow('mxid-1');
      const states = await service.getChapterStates(followed.id, []);
      expect(states).toEqual({});
    });

    it('updateProgress throws when the series is not in the library', async () => {
      await expect(
        service.updateProgress({
          mangadexSeriesId: 'nope',
          mangadexChapterId: 'ch-1',
          page: 0,
          pageCount: 5,
        })
      ).rejects.toThrow(/series not in library/);
    });
  });

  describe('round-trip', () => {
    it('follow → getAll → getSeries → unfollow → getAll transitions cleanly', async () => {
      expect(await service.getAll()).toHaveLength(0);

      const followed = await service.follow('mxid-1');
      expect(await service.getAll()).toHaveLength(1);

      const fetched = await service.getSeries(followed.id);
      expect(fetched!.id).toBe(followed.id);

      await service.unfollow(followed.id);
      expect(await service.getAll()).toHaveLength(0);
      expect(await service.getSeries(followed.id)).toBeNull();
    });
  });
});
