import { createTestDatabase } from './__test__/sqljs-adapter';

/**
 * Thin migration-layer test: the sqljs adapter runs the full migration set
 * at construction time, so this spec just asserts the resulting schema
 * surfaces what each milestone promised. Keeps an early tripwire on anyone
 * who renames a column or drops an index a downstream service depends on.
 */

interface PragmaColumnRow {
  name: string;
}

interface PragmaIndexRow {
  name: string;
}

interface MigrationRow {
  version: number;
}

function listColumns(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  table: string
): string[] {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as PragmaColumnRow[];
  return rows.map(r => r.name);
}

function listIndexes(
  db: Awaited<ReturnType<typeof createTestDatabase>>,
  table: string
): string[] {
  const rows = db.prepare(`PRAGMA index_list(${table})`).all() as PragmaIndexRow[];
  return rows.map(r => r.name);
}

describe('database migrations', () => {
  it('applies every migration in order up to the latest version', async () => {
    const db = await createTestDatabase();
    const rows = db
      .prepare('SELECT version FROM _migrations ORDER BY version ASC')
      .all() as MigrationRow[];
    const versions = rows.map(r => r.version);

    expect(versions).toEqual([1, 2, 3, 4, 5, 6]);
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
});
