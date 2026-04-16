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
