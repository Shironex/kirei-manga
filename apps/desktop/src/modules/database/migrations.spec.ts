import { createTestDatabase } from './__test__/sqljs-adapter';

/**
 * Thin migration-layer test: the sqljs adapter runs the full migration set
 * at construction time, so this spec just asserts the resulting schema
 * surfaces what each milestone promised. Keeps an early tripwire on anyone
 * who renames a column or drops an index a downstream service depends on.
 */

interface PragmaColumnRow {
  name: string;
  type: string;
  notnull: number;
}

interface PragmaIndexRow {
  name: string;
  unique: number;
}

interface PragmaIndexInfoRow {
  seqno: number;
  name: string;
}

interface MigrationRow {
  version: number;
}

function listColumns(db: Awaited<ReturnType<typeof createTestDatabase>>, table: string): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as PragmaColumnRow[];
  return rows.map(r => r.name);
}

function tableInfo(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  table: string
): PragmaColumnRow[] {
  return db.prepare(`PRAGMA table_info(${table})`).all() as PragmaColumnRow[];
}

function listIndexes(db: Awaited<ReturnType<typeof createTestDatabase>>, table: string): string[] {
  const rows = db.prepare(`PRAGMA index_list(${table})`).all() as PragmaIndexRow[];
  return rows.map(r => r.name);
}

function indexList(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  table: string
): PragmaIndexRow[] {
  return db.prepare(`PRAGMA index_list(${table})`).all() as PragmaIndexRow[];
}

function indexColumns(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  indexName: string
): string[] {
  const rows = db.prepare(`PRAGMA index_info(${indexName})`).all() as PragmaIndexInfoRow[];
  return rows.sort((a, b) => a.seqno - b.seqno).map(r => r.name);
}

describe('database migrations', () => {
  it('applies every migration in order up to the latest version', async () => {
    const db = await createTestDatabase();
    const rows = db
      .prepare('SELECT version FROM _migrations ORDER BY version ASC')
      .all() as MigrationRow[];
    const versions = rows.map(r => r.version);

    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('migration 006 adds local library columns to series', async () => {
    const db = await createTestDatabase();
    const columns = listColumns(db, 'series');

    expect(columns).toEqual(expect.arrayContaining(['local_root_path', 'local_content_hash']));
  });

  it('migration 006 creates the local-root index on series', async () => {
    const db = await createTestDatabase();
    const indexes = listIndexes(db, 'series');

    expect(indexes).toContain('idx_series_local_root');
  });

  it('migration 006 adds local_archive_format to chapters', async () => {
    const db = await createTestDatabase();
    const columns = listColumns(db, 'chapters');

    expect(columns).toContain('local_archive_format');
  });

  it('local_archive_format enforces the allowed-values check', async () => {
    const db = await createTestDatabase();

    // Insert a parent series + chapter first — the CHECK only applies when a
    // non-null value is supplied, so we hand the bad value in explicitly.
    db.prepare(
      `INSERT INTO series (id, title, source, status) VALUES ('s1', 'S', 'local', 'reading')`
    ).run();

    expect(() => {
      db.prepare(
        `INSERT INTO chapters (id, series_id, source, chapter_number, local_archive_format)
         VALUES ('c1', 's1', 'local', 1, 'bogus')`
      ).run();
    }).toThrow();

    // A valid value passes.
    expect(() => {
      db.prepare(
        `INSERT INTO chapters (id, series_id, source, chapter_number, local_archive_format)
         VALUES ('c2', 's1', 'local', 1, 'cbz')`
      ).run();
    }).not.toThrow();
  });

  it('migration 007 creates the translation_cache table with the expected columns', async () => {
    const db = await createTestDatabase();
    const info = tableInfo(db, 'translation_cache');
    const byName = new Map(info.map(c => [c.name, c]));

    // Spec the column → SQLite affinity contract the cache layer relies on.
    // `id` is `TEXT PRIMARY KEY` — SQLite quirk: non-INTEGER PRIMARY KEY
    // columns report notnull=0 unless declared NOT NULL explicitly, so we
    // assert PK membership separately and skip the notnull check on id.
    const expected: Array<[string, string, boolean]> = [
      ['page_hash', 'TEXT', true],
      ['bubble_index', 'INTEGER', true],
      ['bbox_x', 'INTEGER', true],
      ['bbox_y', 'INTEGER', true],
      ['bbox_w', 'INTEGER', true],
      ['bbox_h', 'INTEGER', true],
      ['original_text', 'TEXT', true],
      ['translated_text', 'TEXT', true],
      ['target_language', 'TEXT', true],
      ['provider', 'TEXT', true],
      ['created_at', 'TEXT', true],
    ];

    expect(byName.get('id')?.type).toBe('TEXT');

    for (const [name, type, notNull] of expected) {
      const col = byName.get(name);
      expect(col).toBeDefined();
      expect(col!.type).toBe(type);
      expect(Boolean(col!.notnull)).toBe(notNull);
    }
  });

  it('migration 007 enforces UNIQUE(page_hash, bubble_index, target_language, provider)', async () => {
    const db = await createTestDatabase();
    const indexes = indexList(db, 'translation_cache');
    const uniqueIndexes = indexes.filter(i => i.unique === 1);

    const matching = uniqueIndexes
      .map(i => indexColumns(db, i.name))
      .find(
        cols =>
          cols.length === 4 &&
          cols[0] === 'page_hash' &&
          cols[1] === 'bubble_index' &&
          cols[2] === 'target_language' &&
          cols[3] === 'provider'
      );

    expect(matching).toBeDefined();
  });

  it('migration 007 creates the lookup index on (page_hash, target_language, provider)', async () => {
    const db = await createTestDatabase();
    const indexes = listIndexes(db, 'translation_cache');

    expect(indexes).toContain('idx_translation_cache_lookup');
    expect(indexColumns(db, 'idx_translation_cache_lookup')).toEqual([
      'page_hash',
      'target_language',
      'provider',
    ]);
  });

  it('migration 007 adds translation_override to series', async () => {
    const db = await createTestDatabase();
    const info = tableInfo(db, 'series');
    const col = info.find(c => c.name === 'translation_override');

    expect(col).toBeDefined();
    expect(col!.type).toBe('TEXT');
    // No NOT NULL — JSON override is implicit-NULL by default.
    expect(Boolean(col!.notnull)).toBe(false);
  });

  it('migration 008 creates the translation_flags table with the expected columns', async () => {
    const db = await createTestDatabase();
    const info = tableInfo(db, 'translation_flags');
    const byName = new Map(info.map(c => [c.name, c]));

    // Same SQLite quirk as migration 007: TEXT PRIMARY KEY reports notnull=0
    // unless declared explicitly, so assert PK type separately and skip the
    // notnull check on id.
    const expected: Array<[string, string, boolean]> = [
      ['page_hash', 'TEXT', true],
      ['bubble_index', 'INTEGER', true],
      ['reason', 'TEXT', true],
      ['user_note', 'TEXT', false],
      ['flagged_at', 'TEXT', true],
    ];

    expect(byName.get('id')?.type).toBe('TEXT');

    for (const [name, type, notNull] of expected) {
      const col = byName.get(name);
      expect(col).toBeDefined();
      expect(col!.type).toBe(type);
      expect(Boolean(col!.notnull)).toBe(notNull);
    }
  });

  it('migration 008 creates the page lookup index on translation_flags', async () => {
    const db = await createTestDatabase();
    const indexes = listIndexes(db, 'translation_flags');

    expect(indexes).toContain('idx_translation_flags_page');
    expect(indexColumns(db, 'idx_translation_flags_page')).toEqual(['page_hash', 'bubble_index']);
  });
});
