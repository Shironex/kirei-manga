//! Forward migration on a fixture database.
//!
//! The fixture is built from the shipped v1 SQL, stamped as version 1 and
//! filled with rows the way a 1.0 install would hold them. Opening it with
//! the current build must migrate it forward without losing anything. When a
//! migration 0002 lands, this test keeps proving the 1 -> latest path.

#![allow(clippy::unwrap_used)]

use kirei_library::{Library, SCHEMA_VERSION};
use rusqlite::{Connection, params};

const V1: &str = include_str!("../migrations/0001_init.sql");

fn build_v1_fixture(path: &std::path::Path, root: &str) {
    let conn = Connection::open(path).unwrap();
    conn.execute_batch(V1).unwrap();
    conn.pragma_update(None, "user_version", 1).unwrap();
    conn.execute(
        "INSERT INTO library_roots (id, path, added_at, last_scan_at) VALUES (1, ?1, 1000, 2000)",
        [root],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO covers (hash, file, width, height, palette, created_at)
         VALUES ('ab12', 'ab/ab12.jpg', 400, 600,
                 '{\"h\":42.0,\"c\":0.15,\"swatches\":[],\"fallback\":false}', 1500)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO series (id, root_id, key, path, title, sort_title, description, genres,
                             cover_hash, added_at, updated_at)
         VALUES (1, 1, 'dir:/m/Ash', '/m/Ash', 'Ash and Ember', 'ash and ember',
                 'After the city burns.', 'Action, Fantasy', 'ab12', 1000, 1000)",
        [],
    )
    .unwrap();
    for (id, number) in [(1, 1.0), (2, 2.0)] {
        conn.execute(
            "INSERT INTO chapters (id, series_id, path, kind, number, sort_order, page_count,
                                   file_size, file_mtime, added_at, updated_at)
             VALUES (?1, 1, ?2, 'zip', ?3, ?1, 20, 1234, 5678, 1000, 1000)",
            params![id, format!("/m/Ash/c{id:03}.cbz"), number],
        )
        .unwrap();
    }
    conn.execute(
        "INSERT INTO reading_progress (chapter_id, page, page_count, completed, updated_at)
         VALUES (1, 19, 20, 1, 3000), (2, 4, 20, 0, 4000)",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO series_settings (series_id, settings, updated_at)
         VALUES (1, '{\"mode\":\"webtoon\"}', 3000)",
        [],
    )
    .unwrap();
}

#[test]
fn a_v1_database_migrates_forward_with_its_data() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("library.sqlite3");
    build_v1_fixture(&db, "/m");

    let library = Library::open(&db, &dir.path().join("covers")).unwrap();
    assert_eq!(library.schema_version().unwrap(), SCHEMA_VERSION);

    let series = library.series().unwrap();
    assert_eq!(series.len(), 1);
    assert_eq!(series[0].title, "Ash and Ember");
    assert_eq!(series[0].completed_count, 1);
    assert_eq!(series[0].last_read_at, Some(4000));
    assert_eq!(series[0].continue_chapter_id, Some(2));
    let cover = series[0].cover.as_ref().unwrap();
    assert_eq!(cover.palette.h, 42.0);

    let detail = library.series_detail(1).unwrap().unwrap();
    assert_eq!(detail.description.as_deref(), Some("After the city burns."));
    assert_eq!(detail.genres, ["Action", "Fantasy"]);
    assert_eq!(detail.chapters.len(), 2);
    assert_eq!(detail.chapters[1].progress.as_ref().unwrap().page, 4);
    assert_eq!(
        library.series_settings(1).unwrap(),
        Some(serde_json::json!({ "mode": "webtoon" }))
    );
}

#[test]
fn migration_two_keeps_progress_and_backfills_identities() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("library.sqlite3");
    build_v1_fixture(&db, "/m");
    let library = Library::open(&db, &dir.path().join("covers")).unwrap();

    let conn = Connection::open(&db).unwrap();
    let rows: Vec<(String, i64, i64)> = conn
        .prepare("SELECT ident, file_size, page FROM reading_progress ORDER BY chapter_id")
        .unwrap()
        .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
        .unwrap()
        .map(Result::unwrap)
        .collect();
    assert_eq!(
        rows,
        [
            ("dir:Ash|c001.cbz".to_owned(), 1234, 19),
            ("dir:Ash|c002.cbz".to_owned(), 1234, 4)
        ]
    );
    let settings_ident: String = conn
        .query_row("SELECT ident FROM series_settings", [], |r| r.get(0))
        .unwrap();
    assert_eq!(settings_ident, "dir:Ash");
    drop(conn);

    // Removing the root keeps both, orphaned, and hides them from the lists.
    assert!(library.remove_root(1).unwrap());
    assert!(library.series().unwrap().is_empty());
    let conn = Connection::open(&db).unwrap();
    let (progress, orphans): (i64, i64) = conn
        .query_row(
            "SELECT count(*), count(*) FILTER (WHERE chapter_id IS NULL AND orphaned_at IS NOT NULL)
             FROM reading_progress",
            [],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap();
    assert_eq!((progress, orphans), (2, 2));
}

#[test]
fn a_file_database_uses_wal_and_foreign_keys() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("library.sqlite3");
    drop(Library::open(&db, &dir.path().join("covers")).unwrap());
    let conn = Connection::open(&db).unwrap();
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .unwrap();
    assert_eq!(mode, "wal");
}
