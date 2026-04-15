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
