//! Tracker links and the offline update queue (migration 0005).
//!
//! The library stores, it does not talk to AniList: the desktop shell reads
//! due updates, delivers them with `kirei-anilist` and records the outcome
//! here. See `docs/tracking.md`.

use rusqlite::{Connection, OptionalExtension, Row, params};
use serde::Serialize;

use crate::{Library, LibraryError, Result, now_ms};

/// The only tracker so far. Stored per row so another one needs no migration.
pub const ANILIST: &str = "anilist";

/// How a link was made.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum LinkSource {
    /// Picked by the user from a search.
    Manual,
    /// Read from the AniList id in the MangaDex series links.
    Mangadex,
}

impl LinkSource {
    fn as_str(self) -> &'static str {
        match self {
            Self::Manual => "manual",
            Self::Mangadex => "mangadex",
        }
    }

    fn parse(text: &str) -> Self {
        match text {
            "mangadex" => Self::Mangadex,
            _ => Self::Manual,
        }
    }
}

/// A series linked to an AniList entry, with what AniList last said.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackerLink {
    pub series_key: String,
    pub media_id: i64,
    pub source: LinkSource,
    pub title: Option<String>,
    pub total_chapters: Option<i64>,
    pub remote_progress: Option<i64>,
    pub remote_status: Option<String>,
    /// 0 to 100.
    pub remote_score: Option<f64>,
    pub remote_checked_at: Option<i64>,
    /// The progress both sides last agreed on.
    pub synced_progress: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// The AniList side of a link, as last read or written.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct RemoteState {
    pub progress: Option<i64>,
    pub status: Option<String>,
    pub score: Option<f64>,
    pub total_chapters: Option<i64>,
    /// Both sides now agree on `progress` (it was just sent, or found equal).
    pub agreed: bool,
}

/// One update waiting in the queue.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedUpdate {
    pub id: i64,
    pub media_id: i64,
    pub progress: Option<i64>,
    pub status: Option<String>,
    pub score: Option<i64>,
    pub attempts: u32,
    pub last_error: Option<String>,
    /// Bumped by every newer update for the same entry.
    pub revision: i64,
    pub next_attempt_at: i64,
    /// The progress both sides last agreed on, from the link.
    pub synced_progress: Option<i64>,
}

/// A newer value for a queued entry. `None` fields keep what is waiting.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateRequest {
    pub progress: Option<i64>,
    pub status: Option<String>,
    pub score: Option<i64>,
}

/// How the queue stands, for the Settings screen.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueSummary {
    pub pending: i64,
    pub blocked: i64,
    pub failed: i64,
    pub next_attempt_at: Option<i64>,
    pub last_error: Option<String>,
}

const LINK_COLUMNS: &str = "series_key, media_id, source, title, total_chapters, remote_progress, \
     remote_status, remote_score, remote_checked_at, synced_progress, created_at, updated_at";

fn link_from_row(row: &Row<'_>) -> rusqlite::Result<TrackerLink> {
    Ok(TrackerLink {
        series_key: row.get(0)?,
        media_id: row.get(1)?,
        source: LinkSource::parse(&row.get::<_, String>(2)?),
        title: row.get(3)?,
        total_chapters: row.get(4)?,
        remote_progress: row.get(5)?,
        remote_status: row.get(6)?,
        remote_score: row.get(7)?,
        remote_checked_at: row.get(8)?,
        synced_progress: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn load_link(conn: &Connection, series_key: &str) -> Result<Option<TrackerLink>> {
    Ok(conn
        .query_row(
            &format!(
                "SELECT {LINK_COLUMNS} FROM tracker_links WHERE tracker = ?1 AND series_key = ?2"
            ),
            params![ANILIST, series_key],
            link_from_row,
        )
        .optional()?)
}

/// The key a local series is linked under: its stable identity, so the link
/// outlives a removed and re-added folder like reading progress does.
pub fn local_series_key(ident: &str) -> String {
    format!("local:{ident}")
}

/// The key a MangaDex series is linked under.
pub fn mangadex_series_key(manga_id: &str) -> String {
    format!("mangadex:{manga_id}")
}

impl Library {
    /// The tracker key of a library series.
    pub fn series_key(&self, series_id: i64) -> Result<String> {
        let ident: Option<String> = self
            .conn()
            .query_row(
                "SELECT ident FROM series WHERE id = ?1",
                [series_id],
                |row| row.get(0),
            )
            .optional()?
            .flatten();
        ident
            .map(|ident| local_series_key(&ident))
            .ok_or(LibraryError::NotFound("series", series_id))
    }

    /// The series a chapter belongs to.
    pub fn chapter_series(&self, chapter_id: i64) -> Result<Option<i64>> {
        Ok(self
            .conn()
            .query_row(
                "SELECT series_id FROM chapters WHERE id = ?1",
                [chapter_id],
                |row| row.get(0),
            )
            .optional()?)
    }

    pub fn tracker_link(&self, series_key: &str) -> Result<Option<TrackerLink>> {
        load_link(&self.conn(), series_key)
    }

    /// Every link to `media_id`.
    pub fn tracker_links_for_media(&self, media_id: i64) -> Result<Vec<TrackerLink>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {LINK_COLUMNS} FROM tracker_links
             WHERE tracker = ?1 AND media_id = ?2 ORDER BY id"
        ))?;
        Ok(stmt
            .query_map(params![ANILIST, media_id], link_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// Links a series to an AniList entry, replacing any earlier link. A
    /// change of entry forgets what the old one said.
    pub fn link_series(
        &self,
        series_key: &str,
        media_id: i64,
        source: LinkSource,
        title: Option<&str>,
        total_chapters: Option<i64>,
    ) -> Result<TrackerLink> {
        if series_key.trim().is_empty() || media_id <= 0 {
            return Err(LibraryError::InvalidInput(
                "a link needs a series and an AniList id".into(),
            ));
        }
        let conn = self.conn();
        let now = now_ms();
        conn.execute(
            "INSERT INTO tracker_links
                 (tracker, series_key, media_id, source, title, total_chapters,
                  created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
             ON CONFLICT (tracker, series_key) DO UPDATE SET
                 source = excluded.source,
                 title = excluded.title,
                 total_chapters = coalesce(excluded.total_chapters,
                     CASE WHEN tracker_links.media_id = excluded.media_id
                          THEN tracker_links.total_chapters END),
                 remote_progress = CASE WHEN tracker_links.media_id = excluded.media_id
                     THEN tracker_links.remote_progress END,
                 remote_status = CASE WHEN tracker_links.media_id = excluded.media_id
                     THEN tracker_links.remote_status END,
                 remote_score = CASE WHEN tracker_links.media_id = excluded.media_id
                     THEN tracker_links.remote_score END,
                 remote_checked_at = CASE WHEN tracker_links.media_id = excluded.media_id
                     THEN tracker_links.remote_checked_at END,
                 synced_progress = CASE WHEN tracker_links.media_id = excluded.media_id
                     THEN tracker_links.synced_progress END,
                 media_id = excluded.media_id,
                 updated_at = excluded.updated_at",
            params![
                ANILIST,
                series_key,
                media_id,
                source.as_str(),
                title,
                total_chapters,
                now
            ],
        )?;
        load_link(&conn, series_key)?.ok_or(LibraryError::NotFound("link", media_id))
    }

    /// Removes a link. Queued updates for the entry go too, unless another
    /// series is still linked to it.
    pub fn unlink_series(&self, series_key: &str) -> Result<bool> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let media_id: Option<i64> = tx
            .query_row(
                "DELETE FROM tracker_links WHERE tracker = ?1 AND series_key = ?2
                 RETURNING media_id",
                params![ANILIST, series_key],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(media_id) = media_id {
            tx.execute(
                "DELETE FROM tracker_queue WHERE tracker = ?1 AND media_id = ?2
                   AND NOT EXISTS (SELECT 1 FROM tracker_links
                                   WHERE tracker = ?1 AND media_id = ?2)",
                params![ANILIST, media_id],
            )?;
        }
        tx.commit()?;
        Ok(media_id.is_some())
    }

    /// Stores what AniList said about `media_id` on every link to it.
    pub fn record_remote(&self, media_id: i64, remote: &RemoteState) -> Result<()> {
        self.conn().execute(
            "UPDATE tracker_links SET
                 remote_progress = ?3,
                 remote_status = ?4,
                 remote_score = ?5,
                 total_chapters = coalesce(?6, total_chapters),
                 remote_checked_at = ?7,
                 synced_progress = CASE WHEN ?8 THEN ?3 ELSE synced_progress END,
                 updated_at = ?7
             WHERE tracker = ?1 AND media_id = ?2",
            params![
                ANILIST,
                media_id,
                remote.progress,
                remote.status,
                remote.score,
                remote.total_chapters,
                now_ms(),
                remote.agreed
            ],
        )?;
        Ok(())
    }

    /// Queues an update for `media_id`, sent once `delay_ms` has passed. A
    /// waiting update for the same entry takes the new values (fields left
    /// `None` keep theirs), starts over and waits the new delay, which is how
    /// several chapters read in a row become one request.
    pub fn enqueue_update(
        &self,
        media_id: i64,
        update: &UpdateRequest,
        delay_ms: i64,
    ) -> Result<QueuedUpdate> {
        let conn = self.conn();
        let now = now_ms();
        let id: i64 = conn.query_row(
            "INSERT INTO tracker_queue
                 (tracker, media_id, progress, status, score, next_attempt_at,
                  created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
             ON CONFLICT (tracker, media_id) DO UPDATE SET
                 progress = coalesce(excluded.progress, tracker_queue.progress),
                 status = coalesce(excluded.status, tracker_queue.status),
                 score = coalesce(excluded.score, tracker_queue.score),
                 state = 'pending',
                 attempts = 0,
                 last_error = NULL,
                 revision = tracker_queue.revision + 1,
                 next_attempt_at = excluded.next_attempt_at,
                 updated_at = excluded.updated_at
             RETURNING id",
            params![
                ANILIST,
                media_id,
                update.progress,
                update.status,
                update.score,
                now + delay_ms.max(0),
                now
            ],
            |row| row.get(0),
        )?;
        load_update(&conn, id)?.ok_or(LibraryError::NotFound("queued update", id))
    }

    /// Pending updates whose time has come, oldest first.
    pub fn due_updates(&self, now: i64, limit: usize) -> Result<Vec<QueuedUpdate>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(&format!(
            "{QUEUE_SELECT} WHERE q.tracker = ?1 AND q.state = 'pending' AND q.next_attempt_at <= ?2
             ORDER BY q.next_attempt_at, q.id LIMIT ?3"
        ))?;
        Ok(stmt
            .query_map(
                params![ANILIST, now, i64::try_from(limit).unwrap_or(i64::MAX)],
                update_from_row,
            )?
            .collect::<rusqlite::Result<Vec<_>>>()?)
    }

    /// When the next pending update is due.
    pub fn next_update_at(&self) -> Result<Option<i64>> {
        Ok(self.conn().query_row(
            "SELECT min(next_attempt_at) FROM tracker_queue
             WHERE tracker = ?1 AND state = 'pending'",
            [ANILIST],
            |row| row.get(0),
        )?)
    }

    /// Removes a delivered update, unless a newer one replaced it meanwhile.
    pub fn complete_update(&self, id: i64, revision: i64) -> Result<bool> {
        Ok(self.conn().execute(
            "DELETE FROM tracker_queue WHERE id = ?1 AND revision = ?2",
            params![id, revision],
        )? > 0)
    }

    /// Counts a failed attempt and schedules the next one `delay_ms` from now.
    pub fn retry_update(&self, id: i64, revision: i64, error: &str, delay_ms: i64) -> Result<()> {
        let now = now_ms();
        self.conn().execute(
            "UPDATE tracker_queue SET attempts = attempts + 1, last_error = ?3,
                 next_attempt_at = ?4, updated_at = ?5
             WHERE id = ?1 AND revision = ?2",
            params![id, revision, error, now + delay_ms.max(0), now],
        )?;
        Ok(())
    }

    /// Parks an update AniList refused for good, with the reason.
    pub fn fail_update(&self, id: i64, revision: i64, error: &str) -> Result<()> {
        self.conn().execute(
            "UPDATE tracker_queue SET state = 'failed', attempts = attempts + 1,
                 last_error = ?3, updated_at = ?4
             WHERE id = ?1 AND revision = ?2",
            params![id, revision, error, now_ms()],
        )?;
        Ok(())
    }

    /// Holds every pending update until the user signs in again.
    pub fn block_updates(&self, error: &str) -> Result<usize> {
        Ok(self.conn().execute(
            "UPDATE tracker_queue SET state = 'blocked', last_error = ?2, updated_at = ?3
             WHERE tracker = ?1 AND state = 'pending'",
            params![ANILIST, error, now_ms()],
        )?)
    }

    /// Releases held updates (after a sign in), and failed ones too when
    /// `include_failed` is set (the user asked to retry). They are due now.
    pub fn release_updates(&self, include_failed: bool) -> Result<usize> {
        let now = now_ms();
        Ok(self.conn().execute(
            "UPDATE tracker_queue SET state = 'pending', attempts = 0, next_attempt_at = ?2,
                 updated_at = ?2
             WHERE tracker = ?1 AND (state = 'blocked' OR (?3 AND state = 'failed'))",
            params![ANILIST, now, include_failed],
        )?)
    }

    /// Deletes every queued update, for a sign out.
    pub fn clear_updates(&self) -> Result<usize> {
        Ok(self
            .conn()
            .execute("DELETE FROM tracker_queue WHERE tracker = ?1", [ANILIST])?)
    }

    pub fn queue_summary(&self) -> Result<QueueSummary> {
        let conn = self.conn();
        let mut summary: QueueSummary = conn.query_row(
            "SELECT
                 count(*) FILTER (WHERE state = 'pending'),
                 count(*) FILTER (WHERE state = 'blocked'),
                 count(*) FILTER (WHERE state = 'failed'),
                 min(next_attempt_at) FILTER (WHERE state = 'pending')
             FROM tracker_queue WHERE tracker = ?1",
            [ANILIST],
            |row| {
                Ok(QueueSummary {
                    pending: row.get(0)?,
                    blocked: row.get(1)?,
                    failed: row.get(2)?,
                    next_attempt_at: row.get(3)?,
                    last_error: None,
                })
            },
        )?;
        summary.last_error = conn
            .query_row(
                "SELECT last_error FROM tracker_queue
                 WHERE tracker = ?1 AND last_error IS NOT NULL
                 ORDER BY updated_at DESC LIMIT 1",
                [ANILIST],
                |row| row.get(0),
            )
            .optional()?;
        Ok(summary)
    }
}

const QUEUE_SELECT: &str = "SELECT q.id, q.media_id, q.progress, q.status, q.score, q.attempts,
        q.last_error, q.revision, q.next_attempt_at,
        (SELECT l.synced_progress FROM tracker_links l
         WHERE l.tracker = q.tracker AND l.media_id = q.media_id
           AND l.synced_progress IS NOT NULL
         ORDER BY l.updated_at DESC LIMIT 1)
     FROM tracker_queue q";

fn update_from_row(row: &Row<'_>) -> rusqlite::Result<QueuedUpdate> {
    Ok(QueuedUpdate {
        id: row.get(0)?,
        media_id: row.get(1)?,
        progress: row.get(2)?,
        status: row.get(3)?,
        score: row.get(4)?,
        attempts: row.get(5)?,
        last_error: row.get(6)?,
        revision: row.get(7)?,
        next_attempt_at: row.get(8)?,
        synced_progress: row.get(9)?,
    })
}

fn load_update(conn: &Connection, id: i64) -> Result<Option<QueuedUpdate>> {
    Ok(conn
        .query_row(
            &format!("{QUEUE_SELECT} WHERE q.id = ?1"),
            [id],
            update_from_row,
        )
        .optional()?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn library() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(dir.path()).unwrap();
        (dir, library)
    }

    fn progress(value: i64) -> UpdateRequest {
        UpdateRequest {
            progress: Some(value),
            ..Default::default()
        }
    }

    #[test]
    fn a_link_is_stored_and_replaced() {
        let (_dir, library) = library();
        let key = local_series_key("dir:Moonlit Road");
        assert_eq!(library.tracker_link(&key).unwrap(), None);
        let link = library
            .link_series(
                &key,
                30013,
                LinkSource::Manual,
                Some("Moonlit Road"),
                Some(20),
            )
            .unwrap();
        assert_eq!(link.media_id, 30013);
        assert_eq!(link.total_chapters, Some(20));

        library
            .record_remote(
                30013,
                &RemoteState {
                    progress: Some(7),
                    status: Some("CURRENT".into()),
                    agreed: true,
                    ..Default::default()
                },
            )
            .unwrap();
        let same = library
            .link_series(&key, 30013, LinkSource::Manual, Some("Moonlit Road"), None)
            .unwrap();
        assert_eq!(
            same.synced_progress,
            Some(7),
            "relinking the same entry keeps it"
        );
        assert_eq!(same.total_chapters, Some(20));

        let other = library
            .link_series(&key, 555, LinkSource::Manual, Some("Other"), None)
            .unwrap();
        assert_eq!(other.media_id, 555);
        assert_eq!(other.remote_progress, None, "a new entry starts clean");
        assert_eq!(other.synced_progress, None);
        assert_eq!(other.total_chapters, None);
    }

    #[test]
    fn remote_state_reaches_every_link_and_agreement_moves_synced() {
        let (_dir, library) = library();
        library
            .link_series("local:a", 1, LinkSource::Manual, None, None)
            .unwrap();
        library
            .link_series("mangadex:b", 1, LinkSource::Mangadex, None, None)
            .unwrap();
        library
            .record_remote(
                1,
                &RemoteState {
                    progress: Some(9),
                    agreed: false,
                    total_chapters: Some(40),
                    ..Default::default()
                },
            )
            .unwrap();
        let links = library.tracker_links_for_media(1).unwrap();
        assert_eq!(links.len(), 2);
        assert!(links.iter().all(|l| l.remote_progress == Some(9)));
        assert!(links.iter().all(|l| l.synced_progress.is_none()));
        assert_eq!(links[1].source, LinkSource::Mangadex);
        library
            .record_remote(
                1,
                &RemoteState {
                    progress: Some(10),
                    agreed: true,
                    ..Default::default()
                },
            )
            .unwrap();
        let link = library.tracker_link("local:a").unwrap().unwrap();
        assert_eq!(link.synced_progress, Some(10));
        assert_eq!(
            link.total_chapters,
            Some(40),
            "an unknown total keeps the old one"
        );
    }

    #[test]
    fn queued_updates_coalesce_per_entry() {
        let (_dir, library) = library();
        let first = library.enqueue_update(7, &progress(3), 0).unwrap();
        let second = library
            .enqueue_update(
                7,
                &UpdateRequest {
                    status: Some("PAUSED".into()),
                    ..Default::default()
                },
                0,
            )
            .unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(second.progress, Some(3), "a field left out keeps its value");
        assert_eq!(second.status.as_deref(), Some("PAUSED"));
        assert_eq!(second.revision, first.revision + 1);
        let third = library.enqueue_update(7, &progress(5), 0).unwrap();
        assert_eq!(third.progress, Some(5));
        assert_eq!(library.due_updates(now_ms(), 10).unwrap().len(), 1);
    }

    #[test]
    fn the_debounce_delay_holds_an_update_back() {
        let (_dir, library) = library();
        let queued = library.enqueue_update(7, &progress(3), 60_000).unwrap();
        assert!(library.due_updates(now_ms(), 10).unwrap().is_empty());
        assert_eq!(
            library.next_update_at().unwrap(),
            Some(queued.next_attempt_at)
        );
        assert_eq!(
            library
                .due_updates(queued.next_attempt_at, 10)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn a_newer_update_survives_the_delivery_of_an_older_one() {
        let (_dir, library) = library();
        let old = library.enqueue_update(7, &progress(3), 0).unwrap();
        library.enqueue_update(7, &progress(4), 0).unwrap();
        assert!(!library.complete_update(old.id, old.revision).unwrap());
        let waiting = library.due_updates(now_ms(), 10).unwrap();
        assert_eq!(waiting[0].progress, Some(4));
        assert!(
            library
                .complete_update(waiting[0].id, waiting[0].revision)
                .unwrap()
        );
        assert!(library.due_updates(now_ms(), 10).unwrap().is_empty());
    }

    #[test]
    fn failures_retry_later_then_go_through() {
        let (_dir, library) = library();
        let queued = library.enqueue_update(7, &progress(3), 0).unwrap();
        library
            .retry_update(queued.id, queued.revision, "cannot reach AniList", 30_000)
            .unwrap();
        assert!(library.due_updates(now_ms(), 10).unwrap().is_empty());
        let summary = library.queue_summary().unwrap();
        assert_eq!(summary.pending, 1);
        assert_eq!(summary.last_error.as_deref(), Some("cannot reach AniList"));

        let later = now_ms() + 30_001;
        let due = library.due_updates(later, 10).unwrap();
        assert_eq!(due[0].attempts, 1);
        assert!(library.complete_update(due[0].id, due[0].revision).unwrap());
        assert_eq!(library.queue_summary().unwrap(), QueueSummary::default());
    }

    #[test]
    fn blocked_and_failed_updates_wait_for_the_user() {
        let (_dir, library) = library();
        let a = library.enqueue_update(1, &progress(3), 0).unwrap();
        library.enqueue_update(2, &progress(3), 0).unwrap();
        library
            .fail_update(a.id, a.revision, "AniList has no such manga")
            .unwrap();
        assert_eq!(library.block_updates("sign in again").unwrap(), 1);
        assert!(library.due_updates(now_ms(), 10).unwrap().is_empty());
        let summary = library.queue_summary().unwrap();
        assert_eq!(
            (summary.pending, summary.blocked, summary.failed),
            (0, 1, 1)
        );

        assert_eq!(library.release_updates(false).unwrap(), 1);
        assert_eq!(library.due_updates(now_ms(), 10).unwrap().len(), 1);
        assert_eq!(library.release_updates(true).unwrap(), 1);
        assert_eq!(library.due_updates(now_ms(), 10).unwrap().len(), 2);
        assert_eq!(library.clear_updates().unwrap(), 2);
    }

    #[test]
    fn due_updates_carry_the_synced_progress() {
        let (_dir, library) = library();
        library
            .link_series("local:a", 9, LinkSource::Manual, None, None)
            .unwrap();
        library
            .record_remote(
                9,
                &RemoteState {
                    progress: Some(12),
                    agreed: true,
                    ..Default::default()
                },
            )
            .unwrap();
        library.enqueue_update(9, &progress(13), 0).unwrap();
        let due = library.due_updates(now_ms(), 10).unwrap();
        assert_eq!(due[0].synced_progress, Some(12));
    }

    #[test]
    fn unlinking_drops_queued_updates_of_an_entry_no_one_links() {
        let (_dir, library) = library();
        library
            .link_series("local:a", 9, LinkSource::Manual, None, None)
            .unwrap();
        library
            .link_series("local:b", 9, LinkSource::Manual, None, None)
            .unwrap();
        library.enqueue_update(9, &progress(1), 0).unwrap();
        assert!(library.unlink_series("local:a").unwrap());
        assert_eq!(
            library.queue_summary().unwrap().pending,
            1,
            "b still links it"
        );
        assert!(library.unlink_series("local:b").unwrap());
        assert_eq!(library.queue_summary().unwrap().pending, 0);
        assert!(!library.unlink_series("local:b").unwrap());
    }

    #[test]
    fn a_series_key_needs_a_series() {
        let (_dir, library) = library();
        assert!(matches!(
            library.series_key(99),
            Err(LibraryError::NotFound("series", 99))
        ));
        assert_eq!(mangadex_series_key("abc"), "mangadex:abc");
    }
}
