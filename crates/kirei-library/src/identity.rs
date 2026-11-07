//! Stable identities for series and chapters.
//!
//! Progress and per-series settings are keyed by these, not by row ids or
//! absolute paths, so they survive a root being removed and the same folder
//! coming back from another location. An identity is made only of names
//! below the root: the series folder name (or the parsed title for archives
//! loose in a root) and the chapter path relative to its series.

use std::path::Path;

use rusqlite::{Connection, params};

use crate::Result;

/// Identity of a series from its scan key and path. `dir:` series use the
/// folder name; `loose:<root>:<title key>` series use the title key.
pub(crate) fn series_ident(key: &str, path: &str) -> String {
    if let Some(rest) = key.strip_prefix("loose:") {
        let title_key = rest
            .strip_prefix(path)
            .and_then(|r| r.strip_prefix(':'))
            .unwrap_or(rest);
        return format!("loose:{title_key}");
    }
    let name = Path::new(path)
        .file_name()
        .map_or_else(|| path.to_owned(), |n| n.to_string_lossy().into_owned());
    format!("dir:{name}")
}

/// Identity of a chapter: its series identity plus the path below the series
/// folder, with `/` separators on every OS.
pub(crate) fn chapter_ident(series_ident: &str, series_path: &str, chapter_path: &str) -> String {
    let relative = Path::new(chapter_path)
        .strip_prefix(series_path)
        .map_or_else(
            |_| chapter_path.to_owned(),
            |rel| {
                rel.components()
                    .map(|c| c.as_os_str().to_string_lossy())
                    .collect::<Vec<_>>()
                    .join("/")
            },
        );
    format!("{series_ident}|{relative}")
}

/// Fills `ident` on rows written before the column existed, and copies it
/// onto progress and settings. Idempotent and cheap once everything is set.
pub(crate) fn backfill(conn: &Connection) -> Result<()> {
    let tx = conn.unchecked_transaction()?;
    let series: Vec<(i64, String, String)> = {
        let mut stmt = tx.prepare("SELECT id, key, path FROM series WHERE ident IS NULL")?;
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect::<rusqlite::Result<_>>()?
    };
    for (id, key, path) in series {
        tx.execute(
            "UPDATE series SET ident = ?1 WHERE id = ?2",
            params![series_ident(&key, &path), id],
        )?;
    }
    let chapters: Vec<(i64, String, String, String)> = {
        let mut stmt = tx.prepare(
            "SELECT c.id, s.ident, s.path, c.path FROM chapters c
             JOIN series s ON s.id = c.series_id WHERE c.ident IS NULL",
        )?;
        stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))?
            .collect::<rusqlite::Result<_>>()?
    };
    for (id, ident, series_path, path) in chapters {
        tx.execute(
            "UPDATE chapters SET ident = ?1 WHERE id = ?2",
            params![chapter_ident(&ident, &series_path, &path), id],
        )?;
    }
    tx.execute(
        "UPDATE reading_progress SET ident = (SELECT c.ident FROM chapters c
             WHERE c.id = reading_progress.chapter_id)
         WHERE ident IS NULL AND chapter_id IS NOT NULL",
        [],
    )?;
    tx.execute(
        "UPDATE series_settings SET ident = (SELECT s.ident FROM series s
             WHERE s.id = series_settings.series_id)
         WHERE ident IS NULL AND series_id IS NOT NULL",
        [],
    )?;
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dir_series_use_the_folder_name_not_the_location() {
        assert_eq!(series_ident("dir:/a/Manga/Ash", "/a/Manga/Ash"), "dir:Ash");
        assert_eq!(series_ident("dir:/b/Ash", "/b/Ash"), "dir:Ash");
    }

    #[test]
    fn loose_series_use_the_title_key_even_with_colons_in_the_root() {
        assert_eq!(
            series_ident("loose:C:\\Manga:wiedzma", "C:\\Manga"),
            "loose:wiedzma"
        );
    }

    #[test]
    fn chapters_are_relative_to_their_series() {
        let a = chapter_ident("dir:Ash", "/a/Ash", "/a/Ash/Vol 01/c001");
        let b = chapter_ident("dir:Ash", "/z/q/Ash", "/z/q/Ash/Vol 01/c001");
        assert_eq!(a, "dir:Ash|Vol 01/c001");
        assert_eq!(a, b);
    }
}
