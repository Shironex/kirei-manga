//! The app settings store: `kirei_core::AppSettings` persisted per key in the
//! `app_settings` table of the library database.
//!
//! Settings live in the library database rather than a file of their own so
//! that there is one file to back up, restore and move in portable mode, and
//! so a write is a SQLite transaction instead of a hand-rolled atomic rename.

use kirei_core::AppSettings;
use rusqlite::{Connection, params};
use serde_json::Value;

use crate::{Library, Result, now_ms};

impl Library {
    /// Every setting, with defaults for the ones never changed.
    pub fn settings(&self) -> Result<AppSettings> {
        load(&self.conn())
    }

    /// Validates and stores one setting, then returns the settings now in
    /// effect. An unknown key or a value of the wrong type or variant is
    /// refused with [`crate::LibraryError::Setting`] and nothing is written.
    pub fn set_setting(&self, key: &str, value: Value) -> Result<AppSettings> {
        let conn = self.conn();
        let next = load(&conn)?.with(key, value)?;
        // Store the value as the contract serializes it, not as sent.
        let stored = next.get(key).unwrap_or(Value::Null);
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT (key) DO UPDATE SET
                 value = excluded.value, updated_at = excluded.updated_at",
            params![key, serde_json::to_string(&stored)?, now_ms()],
        )?;
        Ok(next)
    }
}

fn load(conn: &Connection) -> Result<AppSettings> {
    let mut stmt = conn.prepare_cached("SELECT key, value FROM app_settings")?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    // A row that is not valid JSON is skipped like any other bad value.
    Ok(AppSettings::from_stored(rows.into_iter().filter_map(
        |(key, text)| serde_json::from_str(&text).ok().map(|value| (key, value)),
    )))
}

#[cfg(test)]
mod tests {
    use kirei_core::{ReaderMode, SettingError, ThemeStrength};
    use serde_json::json;

    use crate::LibraryError;

    use super::*;

    fn library() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(dir.path()).unwrap();
        (dir, library)
    }

    #[test]
    fn a_fresh_database_has_the_defaults() {
        let (_dir, library) = library();
        assert_eq!(library.settings().unwrap(), AppSettings::default());
    }

    #[test]
    fn a_setting_persists_across_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let db = dir.path().join("library.sqlite3");
        {
            let library = Library::open(&db, &dir.path().join("covers")).unwrap();
            let next = library
                .set_setting("appearance.strength", json!("vivid"))
                .unwrap();
            assert_eq!(next.strength, ThemeStrength::Vivid);
        }
        let library = Library::open(&db, &dir.path().join("covers")).unwrap();
        assert_eq!(library.settings().unwrap().strength, ThemeStrength::Vivid);
    }

    #[test]
    fn an_invalid_value_is_refused_and_not_written() {
        let (_dir, library) = library();
        let error = library
            .set_setting("reader.mode", json!("sideways"))
            .unwrap_err();
        assert!(matches!(
            error,
            LibraryError::Setting(SettingError::InvalidValue { .. })
        ));
        assert!(error.to_string().contains("reader.mode"));
        assert_eq!(library.settings().unwrap().reader_mode, ReaderMode::Single);
        let rows: i64 = library
            .conn()
            .query_row("SELECT count(*) FROM app_settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rows, 0);
    }

    #[test]
    fn an_unknown_key_is_refused() {
        let (_dir, library) = library();
        assert!(matches!(
            library.set_setting("reader.zoom", json!(2)),
            Err(LibraryError::Setting(SettingError::UnknownKey(_)))
        ));
    }

    #[test]
    fn bad_rows_fall_back_to_defaults() {
        let (_dir, library) = library();
        library
            .conn()
            .execute_batch(
                "INSERT INTO app_settings VALUES ('reader.mode', 'not json', 0);
                 INSERT INTO app_settings VALUES ('reader.fit', '\"diagonal\"', 0);
                 INSERT INTO app_settings VALUES ('future.key', 'true', 0);
                 INSERT INTO app_settings VALUES ('appearance.glass', 'false', 0);",
            )
            .unwrap();
        let settings = library.settings().unwrap();
        assert_eq!(settings.reader_mode, ReaderMode::Single);
        assert_eq!(settings.reader_fit, AppSettings::default().reader_fit);
        assert!(!settings.glass);
    }
}
