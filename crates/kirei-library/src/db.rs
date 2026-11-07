//! Connection setup and the migration ledger.
//!
//! Migrations are plain SQL files embedded at compile time and numbered from
//! one up. `PRAGMA user_version` records the last one applied. Each runs in
//! its own transaction together with the version bump, so a failed step
//! leaves the database at the previous version, never half way.

use std::path::Path;
use std::time::Duration;

use rusqlite::Connection;

use crate::{LibraryError, Result};

/// Every migration, in order. Append only: never edit or renumber a shipped
/// entry, add a new one instead.
pub(crate) const MIGRATIONS: &[(u32, &str)] = &[
    (1, include_str!("../migrations/0001_init.sql")),
    (2, include_str!("../migrations/0002_keep_progress.sql")),
];

/// The schema version this build writes.
pub const SCHEMA_VERSION: u32 = MIGRATIONS[MIGRATIONS.len() - 1].0;

pub(crate) fn open_file(path: &Path) -> Result<Connection> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|source| LibraryError::io(parent, source))?;
    }
    let conn = Connection::open(path)?;
    configure(&conn, true)?;
    migrate(&conn)?;
    crate::identity::backfill(&conn)?;
    Ok(conn)
}

pub(crate) fn open_memory() -> Result<Connection> {
    let conn = Connection::open_in_memory()?;
    configure(&conn, false)?;
    migrate(&conn)?;
    crate::identity::backfill(&conn)?;
    Ok(conn)
}

fn configure(conn: &Connection, wal: bool) -> Result<()> {
    conn.busy_timeout(Duration::from_secs(5))?;
    if wal {
        // `journal_mode` returns the new mode as a row, so it is a query.
        let _mode: String = conn.query_row("PRAGMA journal_mode = WAL", [], |row| row.get(0))?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
    }
    conn.pragma_update(None, "foreign_keys", true)?;
    Ok(())
}

pub(crate) fn schema_version(conn: &Connection) -> Result<u32> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get(0))?)
}

/// Brings the schema up to [`SCHEMA_VERSION`]. Refuses a database written by
/// a newer build instead of guessing at it.
pub(crate) fn migrate(conn: &Connection) -> Result<()> {
    migrate_to(conn, SCHEMA_VERSION)
}

pub(crate) fn migrate_to(conn: &Connection, target: u32) -> Result<()> {
    let current = schema_version(conn)?;
    if current > SCHEMA_VERSION {
        return Err(LibraryError::NewerSchema {
            found: current,
            supported: SCHEMA_VERSION,
        });
    }
    for (version, sql) in MIGRATIONS {
        if *version <= current || *version > target {
            continue;
        }
        let tx = conn.unchecked_transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_are_numbered_from_one_without_gaps() {
        for (index, (version, _)) in MIGRATIONS.iter().enumerate() {
            assert_eq!(*version as usize, index + 1);
        }
    }

    #[test]
    fn a_fresh_database_lands_on_the_latest_schema() {
        let conn = open_memory().unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
        let fk: bool = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert!(fk);
    }

    #[test]
    fn migrating_twice_is_a_no_op() {
        let conn = open_memory().unwrap();
        migrate(&conn).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), SCHEMA_VERSION);
    }

    #[test]
    fn a_newer_database_is_refused() {
        let conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .unwrap();
        assert!(matches!(
            migrate(&conn),
            Err(LibraryError::NewerSchema { .. })
        ));
    }

    #[test]
    fn a_failing_migration_leaves_the_previous_version() {
        let conn = Connection::open_in_memory().unwrap();
        // Occupy a name the first migration creates so it fails part way.
        conn.execute_batch("CREATE TABLE covers (x INTEGER);")
            .unwrap();
        assert!(migrate(&conn).is_err());
        assert_eq!(schema_version(&conn).unwrap(), 0);
        let tables: i64 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE name = 'library_roots'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(tables, 0, "the failed step was rolled back");
    }
}
