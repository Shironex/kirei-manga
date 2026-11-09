//! Online state for MangaDex, kept in the library database (migration 0006):
//! the cached follow list, the updates feed, chapter read markers and the
//! per series language switch.
//!
//! The library stays below the MangaDex client in the crate graph, so series
//! and chapters arrive as JSON values and are stored as they are. The rules
//! that need MangaDex (what to fetch, how to merge) live in the desktop shell;
//! this module only keeps the rows consistent, one transaction per change.

use std::collections::{BTreeMap, HashSet};

use rusqlite::{Connection, OptionalExtension, Transaction, params};
use serde::Serialize;
use serde_json::Value;

use crate::{Library, Result, now_ms};

/// A MangaDex series the app knows about.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineSeries {
    pub manga_id: String,
    /// The cached series as the MangaDex client serialized it; `None` while
    /// only the language switch is set.
    pub data: Option<Value>,
    pub followed: bool,
    pub reading_status: Option<String>,
    /// Only this language on the series page; `None` fills gaps from the chain.
    pub single_language: Option<String>,
}

/// A chapter for the updates feed, before it is stored.
#[derive(Debug, Clone, PartialEq)]
pub struct NewFeedItem {
    pub chapter_id: String,
    pub manga_id: String,
    pub data: Value,
    /// MangaDex's readableAt, in Unix milliseconds.
    pub published_at: i64,
}

/// A stored feed chapter.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedItem {
    pub chapter_id: String,
    pub manga_id: String,
    pub data: Value,
    pub published_at: i64,
    /// When this app first saw the chapter, in Unix milliseconds.
    pub first_seen: i64,
    pub notified: bool,
}

/// A chapter's read marker.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadMarker {
    pub chapter_id: String,
    pub manga_id: String,
    pub read: bool,
    /// A local change MangaDex has not taken yet.
    pub pending: bool,
    /// The page reading stopped on (0 based).
    pub page: u32,
}

fn json_text(value: &Value) -> Result<String> {
    Ok(serde_json::to_string(value)?)
}

fn parse_json(text: Option<String>) -> Option<Value> {
    text.and_then(|text| serde_json::from_str(&text).ok())
}

fn series_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<OnlineSeries> {
    Ok(OnlineSeries {
        manga_id: row.get(0)?,
        data: parse_json(row.get(1)?),
        followed: row.get(2)?,
        reading_status: row.get(3)?,
        single_language: row.get(4)?,
    })
}

const SERIES_COLUMNS: &str = "manga_id, data, followed, reading_status, single_language";

/// Makes sure a series row exists, so a column can be updated on it.
fn ensure_series(tx: &Connection, manga_id: &str, now: i64) -> Result<()> {
    tx.execute(
        "INSERT INTO online_series (manga_id, updated_at) VALUES (?1, ?2)
         ON CONFLICT (manga_id) DO NOTHING",
        params![manga_id, now],
    )?;
    Ok(())
}

/// Drops series rows that hold nothing any more.
fn prune_series(tx: &Transaction<'_>) -> Result<()> {
    tx.execute(
        "DELETE FROM online_series
         WHERE followed = 0 AND reading_status IS NULL AND single_language IS NULL
           AND manga_id NOT IN (SELECT manga_id FROM online_feed)",
        [],
    )?;
    Ok(())
}

impl Library {
    // --- Series ------------------------------------------------------------

    pub fn online_series(&self, manga_id: &str) -> Result<Option<OnlineSeries>> {
        let conn = self.conn();
        Ok(conn
            .query_row(
                &format!("SELECT {SERIES_COLUMNS} FROM online_series WHERE manga_id = ?1"),
                [manga_id],
                series_from_row,
            )
            .optional()?)
    }

    /// Followed series, in the order they were last updated (newest first).
    pub fn online_followed(&self) -> Result<Vec<OnlineSeries>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {SERIES_COLUMNS} FROM online_series WHERE followed = 1
             ORDER BY updated_at DESC, manga_id"
        ))?;
        let rows = stmt
            .query_map([], series_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Caches a series' data, keeping its follow state and switches.
    pub fn online_save_series(&self, manga_id: &str, data: &Value) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO online_series (manga_id, data, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT (manga_id) DO UPDATE SET data = excluded.data",
            params![manga_id, json_text(data)?, now_ms()],
        )?;
        Ok(())
    }

    pub fn online_set_followed(&self, manga_id: &str, followed: bool) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        ensure_series(&tx, manga_id, now)?;
        tx.execute(
            "UPDATE online_series SET followed = ?2, updated_at = ?3 WHERE manga_id = ?1",
            params![manga_id, followed, now],
        )?;
        if !followed {
            tx.execute("DELETE FROM online_feed WHERE manga_id = ?1", [manga_id])?;
        }
        prune_series(&tx)?;
        tx.commit()?;
        Ok(())
    }

    /// Replaces the follow list with what MangaDex says: these series are
    /// followed (with fresh data), every other one is not. Feed chapters of
    /// series no longer followed go too. `follows` is newest first.
    pub fn online_replace_follows(&self, follows: &[(String, Value)]) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        tx.execute("UPDATE online_series SET followed = 0", [])?;
        // Older follows get older stamps so the list keeps MangaDex's order.
        for (position, (manga_id, data)) in follows.iter().enumerate() {
            let stamp = now - i64::try_from(position).unwrap_or(i64::MAX);
            tx.execute(
                "INSERT INTO online_series (manga_id, data, followed, updated_at)
                 VALUES (?1, ?2, 1, ?3)
                 ON CONFLICT (manga_id) DO UPDATE SET
                     data = excluded.data, followed = 1, updated_at = excluded.updated_at",
                params![manga_id, json_text(data)?, stamp],
            )?;
        }
        tx.execute(
            "DELETE FROM online_feed WHERE manga_id NOT IN (
                 SELECT manga_id FROM online_series WHERE followed = 1)",
            [],
        )?;
        prune_series(&tx)?;
        tx.commit()?;
        Ok(())
    }

    pub fn online_set_reading_status(&self, manga_id: &str, status: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        ensure_series(&tx, manga_id, now_ms())?;
        tx.execute(
            "UPDATE online_series SET reading_status = ?2 WHERE manga_id = ?1",
            params![manga_id, status],
        )?;
        prune_series(&tx)?;
        tx.commit()?;
        Ok(())
    }

    /// Replaces every reading status with MangaDex's list.
    pub fn online_replace_reading_statuses(
        &self,
        statuses: &BTreeMap<String, String>,
    ) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        tx.execute("UPDATE online_series SET reading_status = NULL", [])?;
        for (manga_id, status) in statuses {
            ensure_series(&tx, manga_id, now)?;
            tx.execute(
                "UPDATE online_series SET reading_status = ?2 WHERE manga_id = ?1",
                params![manga_id, status],
            )?;
        }
        prune_series(&tx)?;
        tx.commit()?;
        Ok(())
    }

    /// Sets or clears the per series single language switch.
    pub fn online_set_single_language(&self, manga_id: &str, language: Option<&str>) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        ensure_series(&tx, manga_id, now_ms())?;
        tx.execute(
            "UPDATE online_series SET single_language = ?2 WHERE manga_id = ?1",
            params![manga_id, language],
        )?;
        prune_series(&tx)?;
        tx.commit()?;
        Ok(())
    }

    // --- Feed --------------------------------------------------------------

    /// Stores feed chapters and returns the ids that were not stored before,
    /// in the order given. Known chapters get their data refreshed and keep
    /// their first-seen time and notified flag.
    pub fn online_store_feed(&self, items: &[NewFeedItem]) -> Result<Vec<String>> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        let mut fresh = Vec::new();
        for item in items {
            let inserted = tx.execute(
                "INSERT INTO online_feed (chapter_id, manga_id, data, published_at, first_seen)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT (chapter_id) DO NOTHING",
                params![
                    item.chapter_id,
                    item.manga_id,
                    json_text(&item.data)?,
                    item.published_at,
                    now
                ],
            )?;
            if inserted > 0 {
                fresh.push(item.chapter_id.clone());
            } else {
                tx.execute(
                    "UPDATE online_feed SET data = ?2, published_at = ?3 WHERE chapter_id = ?1",
                    params![item.chapter_id, json_text(&item.data)?, item.published_at],
                )?;
            }
        }
        tx.commit()?;
        Ok(fresh)
    }

    /// The newest feed chapters, at most `limit`.
    pub fn online_feed(&self, limit: u32) -> Result<Vec<FeedItem>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(
            "SELECT chapter_id, manga_id, data, published_at, first_seen, notified
             FROM online_feed ORDER BY published_at DESC, chapter_id LIMIT ?1",
        )?;
        let rows = stmt
            .query_map([limit], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, bool>(5)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows
            .into_iter()
            .filter_map(
                |(chapter_id, manga_id, data, published_at, first_seen, notified)| {
                    Some(FeedItem {
                        chapter_id,
                        manga_id,
                        data: serde_json::from_str(&data).ok()?,
                        published_at,
                        first_seen,
                        notified,
                    })
                },
            )
            .collect())
    }

    pub fn online_mark_notified(&self, chapter_ids: &[String]) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        for id in chapter_ids {
            tx.execute(
                "UPDATE online_feed SET notified = 1 WHERE chapter_id = ?1",
                [id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Forgets feed chapters published before `before` (Unix milliseconds).
    pub fn online_prune_feed(&self, before: i64) -> Result<usize> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let removed = tx.execute("DELETE FROM online_feed WHERE published_at < ?1", [before])?;
        prune_series(&tx)?;
        tx.commit()?;
        Ok(removed)
    }

    // --- Read markers ------------------------------------------------------

    /// Every marker of one series.
    pub fn online_read_markers(&self, manga_id: &str) -> Result<Vec<ReadMarker>> {
        let conn = self.conn();
        markers_where(&conn, "manga_id = ?1", [manga_id])
    }

    /// Markers waiting to be sent to MangaDex.
    pub fn online_pending_markers(&self) -> Result<Vec<ReadMarker>> {
        let conn = self.conn();
        markers_where(&conn, "pending = 1", [])
    }

    /// Marks chapters read or unread here. `pending` says MangaDex still has
    /// to hear about it (a change made in the app); false records what
    /// MangaDex already knows.
    pub fn online_mark_chapters(
        &self,
        manga_id: &str,
        chapter_ids: &[String],
        read: bool,
        pending: bool,
    ) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        for id in chapter_ids {
            tx.execute(
                "INSERT INTO online_read (chapter_id, manga_id, read, pending, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT (chapter_id) DO UPDATE SET
                     manga_id = excluded.manga_id, read = excluded.read,
                     pending = excluded.pending, updated_at = excluded.updated_at",
                params![id, manga_id, read, pending, now],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Records the page reading stopped on, without touching the marker.
    pub fn online_record_page(&self, manga_id: &str, chapter_id: &str, page: u32) -> Result<()> {
        let conn = self.conn();
        conn.execute(
            "INSERT INTO online_read (chapter_id, manga_id, page, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (chapter_id) DO UPDATE SET
                 page = excluded.page, updated_at = excluded.updated_at",
            params![chapter_id, manga_id, page, now_ms()],
        )?;
        Ok(())
    }

    /// Clears the pending flag of markers MangaDex has taken, unless they
    /// changed again since (`read` must still match).
    pub fn online_markers_sent(&self, sent: &[(String, bool)]) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        for (id, read) in sent {
            tx.execute(
                "UPDATE online_read SET pending = 0 WHERE chapter_id = ?1 AND read = ?2",
                params![id, read],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// Merges MangaDex's read list for one series: chapters it lists are
    /// read, chapters it does not list are unread. A pending local change
    /// wins over both, since it has not reached MangaDex yet.
    pub fn online_merge_remote_markers(
        &self,
        manga_id: &str,
        remote_read: &[String],
    ) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        let remote: HashSet<&str> = remote_read.iter().map(String::as_str).collect();
        tx.execute(
            "UPDATE online_read SET read = 0
             WHERE manga_id = ?1 AND pending = 0 AND read = 1",
            [manga_id],
        )?;
        for id in &remote {
            tx.execute(
                "INSERT INTO online_read (chapter_id, manga_id, read, updated_at)
                 VALUES (?1, ?2, 1, ?3)
                 ON CONFLICT (chapter_id) DO UPDATE SET read = 1 WHERE pending = 0",
                params![id, manga_id, now],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    // --- Account -----------------------------------------------------------

    pub fn online_state(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn();
        Ok(conn
            .query_row(
                "SELECT value FROM online_state WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()?)
    }

    /// Sets a state value; `None` removes it.
    pub fn online_set_state(&self, key: &str, value: Option<&str>) -> Result<()> {
        let conn = self.conn();
        match value {
            Some(value) => conn.execute(
                "INSERT INTO online_state (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )?,
            None => conn.execute("DELETE FROM online_state WHERE key = ?1", [key])?,
        };
        Ok(())
    }

    /// Forgets what belongs to the signed-in account (follows, statuses, the
    /// feed, unsent markers, account state) after a sign out. Read markers
    /// already on MangaDex, resume pages and language switches stay.
    pub fn online_forget_account(&self) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        tx.execute(
            "UPDATE online_series SET followed = 0, reading_status = NULL",
            [],
        )?;
        tx.execute("DELETE FROM online_feed", [])?;
        tx.execute("UPDATE online_read SET pending = 0", [])?;
        tx.execute("DELETE FROM online_state", [])?;
        prune_series(&tx)?;
        tx.commit()?;
        Ok(())
    }
}

fn markers_where<P: rusqlite::Params>(
    conn: &Connection,
    filter: &str,
    params: P,
) -> Result<Vec<ReadMarker>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT chapter_id, manga_id, read, pending, page FROM online_read
         WHERE {filter} ORDER BY chapter_id"
    ))?;
    let rows = stmt
        .query_map(params, |row| {
            Ok(ReadMarker {
                chapter_id: row.get(0)?,
                manga_id: row.get(1)?,
                read: row.get(2)?,
                pending: row.get(3)?,
                page: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn library() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(dir.path()).unwrap();
        (dir, library)
    }

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|id| (*id).to_owned()).collect()
    }

    fn item(chapter: &str, manga: &str, published_at: i64) -> NewFeedItem {
        NewFeedItem {
            chapter_id: chapter.into(),
            manga_id: manga.into(),
            data: json!({ "id": chapter }),
            published_at,
        }
    }

    #[test]
    fn follows_are_replaced_in_order_and_take_their_feed_with_them() {
        let (_dir, library) = library();
        library
            .online_replace_follows(&[
                ("m1".into(), json!({ "id": "m1" })),
                ("m2".into(), json!({ "id": "m2" })),
            ])
            .unwrap();
        library
            .online_store_feed(&[item("c1", "m1", 10), item("c2", "m2", 20)])
            .unwrap();
        let followed: Vec<_> = library
            .online_followed()
            .unwrap()
            .into_iter()
            .map(|s| s.manga_id)
            .collect();
        assert_eq!(followed, ids(&["m1", "m2"]));

        library
            .online_replace_follows(&[("m2".into(), json!({ "id": "m2" }))])
            .unwrap();
        let feed = library.online_feed(10).unwrap();
        assert_eq!(feed.len(), 1);
        assert_eq!(feed[0].chapter_id, "c2");
        assert!(library.online_series("m1").unwrap().is_none(), "pruned");
    }

    #[test]
    fn the_language_switch_survives_unfollowing() {
        let (_dir, library) = library();
        library.online_set_followed("m1", true).unwrap();
        library
            .online_set_single_language("m1", Some("en"))
            .unwrap();
        library.online_set_followed("m1", false).unwrap();
        let series = library.online_series("m1").unwrap().unwrap();
        assert!(!series.followed);
        assert_eq!(series.single_language.as_deref(), Some("en"));
        library.online_set_single_language("m1", None).unwrap();
        assert!(library.online_series("m1").unwrap().is_none());
    }

    #[test]
    fn storing_the_feed_reports_only_new_chapters() {
        let (_dir, library) = library();
        library.online_set_followed("m1", true).unwrap();
        let fresh = library
            .online_store_feed(&[item("c1", "m1", 10), item("c2", "m1", 20)])
            .unwrap();
        assert_eq!(fresh, ids(&["c1", "c2"]));
        library.online_mark_notified(&ids(&["c1"])).unwrap();
        let again = library
            .online_store_feed(&[item("c2", "m1", 20), item("c3", "m1", 30)])
            .unwrap();
        assert_eq!(again, ids(&["c3"]));
        let feed = library.online_feed(10).unwrap();
        let order: Vec<_> = feed.iter().map(|f| f.chapter_id.as_str()).collect();
        assert_eq!(order, ["c3", "c2", "c1"]);
        assert!(feed[2].notified);
        assert_eq!(library.online_prune_feed(15).unwrap(), 1);
    }

    #[test]
    fn remote_markers_merge_but_pending_changes_win() {
        let (_dir, library) = library();
        library
            .online_mark_chapters("m1", &ids(&["a", "b"]), true, false)
            .unwrap();
        // Read here, not yet sent.
        library
            .online_mark_chapters("m1", &ids(&["c"]), true, true)
            .unwrap();
        // Unread here, not yet sent.
        library
            .online_mark_chapters("m1", &ids(&["d"]), false, true)
            .unwrap();
        library.online_record_page("m1", "b", 7).unwrap();

        // MangaDex: b and d read, a was unread elsewhere.
        library
            .online_merge_remote_markers("m1", &ids(&["b", "d", "e"]))
            .unwrap();
        let markers = library.online_read_markers("m1").unwrap();
        let state: Vec<_> = markers
            .iter()
            .map(|m| (m.chapter_id.as_str(), m.read, m.pending))
            .collect();
        assert_eq!(
            state,
            [
                ("a", false, false),
                ("b", true, false),
                ("c", true, true),
                ("d", false, true),
                ("e", true, false),
            ]
        );
        assert_eq!(markers[1].page, 7);

        library
            .online_markers_sent(&[("c".into(), true), ("d".into(), true)])
            .unwrap();
        let pending: Vec<_> = library
            .online_pending_markers()
            .unwrap()
            .into_iter()
            .map(|m| m.chapter_id)
            .collect();
        assert_eq!(pending, ids(&["d"]), "d changed again, so it stays pending");
    }

    #[test]
    fn signing_out_forgets_the_account_but_keeps_reading_history() {
        let (_dir, library) = library();
        library
            .online_replace_follows(&[("m1".into(), json!({}))])
            .unwrap();
        library
            .online_set_reading_status("m1", Some("reading"))
            .unwrap();
        library
            .online_set_single_language("m2", Some("pl"))
            .unwrap();
        library.online_store_feed(&[item("c1", "m1", 1)]).unwrap();
        library
            .online_mark_chapters("m1", &ids(&["c1"]), true, true)
            .unwrap();
        library
            .online_set_state("username", Some("reader"))
            .unwrap();

        library.online_forget_account().unwrap();
        assert!(library.online_followed().unwrap().is_empty());
        assert!(library.online_feed(10).unwrap().is_empty());
        assert!(library.online_pending_markers().unwrap().is_empty());
        assert_eq!(library.online_state("username").unwrap(), None);
        assert_eq!(library.online_read_markers("m1").unwrap().len(), 1);
        assert!(library.online_series("m2").unwrap().is_some());
    }

    #[test]
    fn statuses_are_replaced_as_a_whole() {
        let (_dir, library) = library();
        library
            .online_set_reading_status("m1", Some("reading"))
            .unwrap();
        let mut statuses = BTreeMap::new();
        statuses.insert("m2".to_owned(), "completed".to_owned());
        library.online_replace_reading_statuses(&statuses).unwrap();
        assert!(library.online_series("m1").unwrap().is_none());
        assert_eq!(
            library
                .online_series("m2")
                .unwrap()
                .unwrap()
                .reading_status
                .as_deref(),
            Some("completed")
        );
    }
}
