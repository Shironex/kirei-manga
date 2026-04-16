import type Database from 'better-sqlite3';
import { createLogger } from '@kireimanga/shared';

const logger = createLogger('Migrations');

interface Migration {
  version: number;
  description: string;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    description: 'Create schema_version tracking table',
    up: `
      CREATE TABLE IF NOT EXISTS schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      INSERT OR IGNORE INTO schema_version (id, version) VALUES (1, 1);
    `,
  },
  {
    version: 2,
    description: 'Create library tables (series, chapters, bookmarks, reading_sessions)',
    up: `
      CREATE TABLE IF NOT EXISTS series (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        title_japanese TEXT,
        cover_path TEXT,
        source TEXT NOT NULL CHECK (source IN ('local', 'mangadex')),
        mangadex_id TEXT UNIQUE,
        anilist_id INTEGER,
        status TEXT NOT NULL DEFAULT 'planToRead'
          CHECK (status IN ('reading', 'completed', 'planToRead', 'onHold', 'dropped')),
        score INTEGER CHECK (score IS NULL OR (score >= 1 AND score <= 10)),
        notes TEXT,
        added_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_read_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_series_status ON series(status);
      CREATE INDEX IF NOT EXISTS idx_series_mangadex ON series(mangadex_id);
      CREATE INDEX IF NOT EXISTS idx_series_source ON series(source);

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        title TEXT,
        chapter_number REAL NOT NULL,
        volume_number REAL,
        source TEXT NOT NULL CHECK (source IN ('local', 'mangadex')),
        mangadex_chapter_id TEXT UNIQUE,
        local_path TEXT,
        page_count INTEGER NOT NULL DEFAULT 0,
        is_downloaded INTEGER NOT NULL DEFAULT 0,
        is_read INTEGER NOT NULL DEFAULT 0,
        last_read_page INTEGER NOT NULL DEFAULT 0,
        read_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_chapters_series ON chapters(series_id);
      CREATE INDEX IF NOT EXISTS idx_chapters_is_read ON chapters(is_read);
      CREATE INDEX IF NOT EXISTS idx_chapters_mangadex ON chapters(mangadex_chapter_id);

      CREATE TABLE IF NOT EXISTS bookmarks (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        series_id TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
        page INTEGER NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(chapter_id, page)
      );
      CREATE INDEX IF NOT EXISTS idx_bookmarks_chapter ON bookmarks(chapter_id);
      CREATE INDEX IF NOT EXISTS idx_bookmarks_series ON bookmarks(series_id);

      CREATE TABLE IF NOT EXISTS reading_sessions (
        id TEXT PRIMARY KEY,
        chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        start_page INTEGER NOT NULL,
        end_page INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        duration_seconds INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_chapter ON reading_sessions(chapter_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_started ON reading_sessions(started_at);
    `,
  },
  {
    version: 3,
    description: 'Add reader preferences to series',
    up: `
      ALTER TABLE series ADD COLUMN reader_mode TEXT
        CHECK (reader_mode IS NULL OR reader_mode IN ('single','double','webtoon'));
      ALTER TABLE series ADD COLUMN reader_direction TEXT
        CHECK (reader_direction IS NULL OR reader_direction IN ('rtl','ltr'));
      ALTER TABLE series ADD COLUMN reader_fit TEXT
        CHECK (reader_fit IS NULL OR reader_fit IN ('width','height','original'));
    `,
  },
];

/**
 * Run pending database migrations in order. Each migration runs inside a
 * transaction so partial failures roll back cleanly.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      description TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const row = db.prepare('SELECT MAX(version) AS current_version FROM _migrations').get() as
    | { current_version: number | null }
    | undefined;
  const currentVersion = row?.current_version ?? 0;

  const pending = MIGRATIONS.filter(m => m.version > currentVersion);

  if (pending.length === 0) {
    logger.debug(`Database is up to date (version ${currentVersion})`);
    return;
  }

  logger.info(`Running ${pending.length} pending migration(s) from version ${currentVersion}`);

  for (const migration of pending) {
    const applyMigration = db.transaction(() => {
      db.exec(migration.up);
      db.prepare('INSERT INTO _migrations (version, description) VALUES (?, ?)').run(
        migration.version,
        migration.description
      );
    });

    applyMigration();
    logger.info(`Applied migration v${migration.version}: ${migration.description}`);
  }

  logger.info(
    `All migrations applied. Database now at version ${pending[pending.length - 1].version}`
  );
}
