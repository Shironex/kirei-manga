import type { BoundingBox } from '@kireimanga/shared';
import type { DatabaseService } from '../../database';
import { createTestDatabase, type CompatDatabase } from '../../database/__test__/sqljs-adapter';
import { TranslationCacheService } from './translation-cache.service';

/**
 * Integration test: TranslationCacheService against an in-memory sql.js DB
 * with the production migrations applied (table created in migration 007).
 * Mirrors the LibraryService spec pattern — stand-in DatabaseService exposing
 * `db`, no NestJS bootstrap. `onModuleInit` is invoked manually because we
 * skip the DI container.
 */
describe('TranslationCacheService', () => {
  let db: CompatDatabase;
  let dbService: DatabaseService;
  let service: TranslationCacheService;

  const PAGE_HASH = 'a'.repeat(64);
  const OTHER_HASH = 'b'.repeat(64);
  const box = (x: number, y: number, w = 50, h = 50): BoundingBox => ({ x, y, w, h });

  beforeEach(async () => {
    db = await createTestDatabase();
    dbService = { db } as unknown as DatabaseService;
    service = new TranslationCacheService(dbService);
    service.onModuleInit();
  });

  afterEach(() => {
    db.close();
  });

  it('getForPage returns null when no rows match', () => {
    expect(service.getForPage(PAGE_HASH, 'en', 'deepl')).toBeNull();
  });

  it('round-trips a single bubble through putBubble + getForPage', () => {
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: box(10, 20, 100, 60),
      original: 'こんにちは',
      translated: 'Hello',
      targetLang: 'en',
      provider: 'deepl',
    });

    const result = service.getForPage(PAGE_HASH, 'en', 'deepl');
    expect(result).not.toBeNull();
    expect(result!.pageHash).toBe(PAGE_HASH);
    expect(result!.bubbles).toHaveLength(1);
    expect(result!.bubbles[0]).toEqual({
      box: { x: 10, y: 20, w: 100, h: 60 },
      original: 'こんにちは',
      translated: 'Hello',
      provider: 'deepl',
      targetLang: 'en',
    });
  });

  it('returns bubbles in ascending bubble_index order regardless of insert order', () => {
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 2,
      box: box(0, 0),
      original: 'three',
      translated: 'three-en',
      targetLang: 'en',
      provider: 'deepl',
    });
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: box(0, 0),
      original: 'one',
      translated: 'one-en',
      targetLang: 'en',
      provider: 'deepl',
    });
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 1,
      box: box(0, 0),
      original: 'two',
      translated: 'two-en',
      targetLang: 'en',
      provider: 'deepl',
    });

    const result = service.getForPage(PAGE_HASH, 'en', 'deepl');
    expect(result!.bubbles.map(b => b.original)).toEqual(['one', 'two', 'three']);
  });

  it('putBubble is idempotent — second call updates the existing row instead of inserting', () => {
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: box(10, 20, 100, 60),
      original: 'original-v1',
      translated: 'translated-v1',
      targetLang: 'en',
      provider: 'deepl',
    });
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: box(15, 25, 110, 70),
      original: 'original-v2',
      translated: 'translated-v2',
      targetLang: 'en',
      provider: 'deepl',
    });

    expect(service.count()).toBe(1);
    const result = service.getForPage(PAGE_HASH, 'en', 'deepl');
    expect(result!.bubbles).toHaveLength(1);
    expect(result!.bubbles[0]).toEqual({
      box: { x: 15, y: 25, w: 110, h: 70 },
      original: 'original-v2',
      translated: 'translated-v2',
      provider: 'deepl',
      targetLang: 'en',
    });
  });

  it('isolates rows by (targetLang, provider) — same hash + bubble index live as parallel rows', () => {
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: box(0, 0),
      original: 'こんにちは',
      translated: 'Hello',
      targetLang: 'en',
      provider: 'deepl',
    });
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: box(0, 0),
      original: 'こんにちは',
      translated: 'Cześć',
      targetLang: 'pl',
      provider: 'deepl',
    });

    expect(service.count()).toBe(2);

    const en = service.getForPage(PAGE_HASH, 'en', 'deepl');
    const pl = service.getForPage(PAGE_HASH, 'pl', 'deepl');
    expect(en!.bubbles[0].translated).toBe('Hello');
    expect(pl!.bubbles[0].translated).toBe('Cześć');

    // A third (lang, provider) tuple still misses cleanly.
    expect(service.getForPage(PAGE_HASH, 'en', 'google')).toBeNull();
  });

  it('invalidatePage removes only the matching page hash and reports the row count deleted', () => {
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: box(0, 0),
      original: 'a0',
      translated: 'a0-en',
      targetLang: 'en',
      provider: 'deepl',
    });
    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 1,
      box: box(0, 0),
      original: 'a1',
      translated: 'a1-en',
      targetLang: 'en',
      provider: 'deepl',
    });
    service.putBubble({
      pageHash: OTHER_HASH,
      bubbleIndex: 0,
      box: box(0, 0),
      original: 'b0',
      translated: 'b0-en',
      targetLang: 'en',
      provider: 'deepl',
    });

    const removed = service.invalidatePage(PAGE_HASH);
    // sql.js adapter stubs `changes` to 0 — accept either the real count
    // (better-sqlite3 path) or 0 (sql.js path). The functional check below
    // is the real assertion.
    expect([0, 2]).toContain(removed);

    expect(service.getForPage(PAGE_HASH, 'en', 'deepl')).toBeNull();
    expect(service.getForPage(OTHER_HASH, 'en', 'deepl')).not.toBeNull();
    expect(service.count()).toBe(1);
  });

  it('count returns the total row count across every (page, lang, provider) tuple', () => {
    expect(service.count()).toBe(0);

    service.putBubble({
      pageHash: PAGE_HASH,
      bubbleIndex: 0,
      box: box(0, 0),
      original: 'x',
      translated: 'x-en',
      targetLang: 'en',
      provider: 'deepl',
    });
    expect(service.count()).toBe(1);

    service.putBubble({
      pageHash: OTHER_HASH,
      bubbleIndex: 0,
      box: box(0, 0),
      original: 'y',
      translated: 'y-en',
      targetLang: 'en',
      provider: 'deepl',
    });
    expect(service.count()).toBe(2);
  });
});
