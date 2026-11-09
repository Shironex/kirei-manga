//! The persistent queue: a small SQLite file of its own
//! (`<data>/downloads.sqlite3`), separate from the library database so queue
//! writes never wait on a scan and the library schema stays untouched.
//!
//! Opening the store puts every job that was downloading back in the queue,
//! which is how a download interrupted by a crash or a quit resumes.

use std::path::Path;

use kirei_mangadex::ImageQuality;
use rusqlite::{Connection, OptionalExtension, Row, params};

use crate::error::{DownloadError, Result};
use crate::model::{DownloadJob, JobState, parse_quality, quality_str};
use crate::now_ms;

const SCHEMA_VERSION: u32 = 1;

const SCHEMA: &str = "
CREATE TABLE jobs (
    id            INTEGER PRIMARY KEY,
    chapter_id    TEXT NOT NULL UNIQUE,
    manga_id      TEXT,
    series_title  TEXT,
    chapter_label TEXT,
    language      TEXT,
    quality       TEXT NOT NULL,
    state         TEXT NOT NULL,
    pages_done    INTEGER NOT NULL DEFAULT 0,
    pages_total   INTEGER,
    error         TEXT,
    path          TEXT,
    auto          INTEGER NOT NULL DEFAULT 0,
    added_at      INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
);
CREATE INDEX jobs_state ON jobs (state, id);
-- One folder per series, chosen at its first download and reused after, so a
-- later title change on MangaDex never splits a series in two.
CREATE TABLE series_folders (
    manga_id TEXT PRIMARY KEY,
    folder   TEXT NOT NULL UNIQUE
);
";

const COLUMNS: &str = "id, chapter_id, manga_id, series_title, chapter_label, language, quality, \
     state, pages_done, pages_total, error, path, auto, added_at, updated_at";

/// What a job learns once the chapter's details are in.
#[derive(Debug, Clone)]
pub(crate) struct Description<'a> {
    pub(crate) manga_id: &'a str,
    pub(crate) series_title: &'a str,
    pub(crate) chapter_label: &'a str,
    pub(crate) language: &'a str,
    pub(crate) path: &'a str,
}

/// The queue database.
#[derive(Debug)]
pub struct Store {
    conn: Connection,
}

impl Store {
    /// Opens (or creates) the queue file and requeues interrupted jobs.
    pub fn open(path: &Path) -> Result<Self> {
        if let Some(folder) = path.parent() {
            std::fs::create_dir_all(folder)?;
        }
        let conn = Connection::open(path)?;
        conn.pragma_update(None, "journal_mode", "WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        Self::init(conn)
    }

    /// A queue that lives in memory, for tests.
    pub fn open_in_memory() -> Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> Result<Self> {
        conn.busy_timeout(std::time::Duration::from_secs(5))?;
        let version: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version > SCHEMA_VERSION {
            return Err(DownloadError::NewerQueue(version));
        }
        if version < 1 {
            let tx = conn.unchecked_transaction()?;
            tx.execute_batch(SCHEMA)?;
            tx.pragma_update(None, "user_version", SCHEMA_VERSION)?;
            tx.commit()?;
        }
        conn.execute(
            "UPDATE jobs SET state = 'queued', updated_at = ?1 WHERE state = 'downloading'",
            params![now_ms()],
        )?;
        Ok(Self { conn })
    }

    /// Adds chapters to the queue. A chapter already queued, downloading,
    /// paused or done stays as it is (a done one is queued again only when
    /// its archive is gone); a failed one is queued again. Returns the jobs
    /// that were added or requeued.
    pub(crate) fn enqueue(
        &self,
        chapter_ids: &[String],
        quality: ImageQuality,
        auto: bool,
    ) -> Result<Vec<DownloadJob>> {
        let now = now_ms();
        let mut changed = Vec::new();
        for chapter_id in chapter_ids {
            let existing = self.by_chapter(chapter_id)?;
            let id = match existing {
                None => {
                    self.conn.execute(
                        "INSERT INTO jobs (chapter_id, quality, state, auto, added_at, updated_at)
                         VALUES (?1, ?2, 'queued', ?3, ?4, ?4)",
                        params![chapter_id, quality_str(quality), auto, now],
                    )?;
                    self.conn.last_insert_rowid()
                }
                Some(job) => {
                    let missing_archive = job.state == JobState::Done
                        && !job
                            .path
                            .as_deref()
                            .is_some_and(|path| Path::new(path).is_file());
                    if job.state != JobState::Failed && !missing_archive {
                        continue;
                    }
                    self.conn.execute(
                        "UPDATE jobs SET state = 'queued', error = NULL, quality = ?2,
                         updated_at = ?3 WHERE id = ?1",
                        params![job.id, quality_str(quality), now],
                    )?;
                    if missing_archive {
                        self.conn.execute(
                            "UPDATE jobs SET pages_done = 0 WHERE id = ?1",
                            params![job.id],
                        )?;
                    }
                    job.id
                }
            };
            if let Some(job) = self.get(id)? {
                changed.push(job);
            }
        }
        Ok(changed)
    }

    pub fn get(&self, id: i64) -> Result<Option<DownloadJob>> {
        Ok(self
            .conn
            .query_row(
                &format!("SELECT {COLUMNS} FROM jobs WHERE id = ?1"),
                params![id],
                job_from_row,
            )
            .optional()?)
    }

    fn by_chapter(&self, chapter_id: &str) -> Result<Option<DownloadJob>> {
        Ok(self
            .conn
            .query_row(
                &format!("SELECT {COLUMNS} FROM jobs WHERE chapter_id = ?1"),
                params![chapter_id],
                job_from_row,
            )
            .optional()?)
    }

    /// Every job, oldest first.
    pub fn jobs(&self) -> Result<Vec<DownloadJob>> {
        let mut statement = self
            .conn
            .prepare(&format!("SELECT {COLUMNS} FROM jobs ORDER BY id"))?;
        let jobs = statement
            .query_map([], job_from_row)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(jobs)
    }

    /// The oldest queued job not in `running`.
    pub(crate) fn next_queued(&self, running: &[i64]) -> Result<Option<i64>> {
        let mut statement = self
            .conn
            .prepare("SELECT id FROM jobs WHERE state = 'queued' ORDER BY id")?;
        let ids = statement.query_map([], |row| row.get::<_, i64>(0))?;
        for id in ids {
            let id = id?;
            if !running.contains(&id) {
                return Ok(Some(id));
            }
        }
        Ok(None)
    }

    /// Whether any job waits or runs.
    pub(crate) fn has_work(&self) -> Result<bool> {
        Ok(self.conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM jobs WHERE state IN ('queued', 'downloading'))",
            [],
            |row| row.get(0),
        )?)
    }

    /// Moves a job to `to` if it is in one of `from`. Returns whether it
    /// moved. Leaving `failed` clears the error.
    pub(crate) fn transition(&self, id: i64, from: &[JobState], to: JobState) -> Result<bool> {
        let current = self.get(id)?;
        let Some(job) = current.filter(|job| from.contains(&job.state)) else {
            return Ok(false);
        };
        let error = if to == JobState::Failed {
            job.error
        } else {
            None
        };
        self.conn.execute(
            "UPDATE jobs SET state = ?2, error = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, to.as_str(), error, now_ms()],
        )?;
        Ok(true)
    }

    pub(crate) fn describe(&self, id: i64, description: &Description<'_>) -> Result<()> {
        self.conn.execute(
            "UPDATE jobs SET manga_id = ?2, series_title = ?3, chapter_label = ?4, language = ?5,
             path = ?6, updated_at = ?7 WHERE id = ?1",
            params![
                id,
                description.manga_id,
                description.series_title,
                description.chapter_label,
                description.language,
                description.path,
                now_ms()
            ],
        )?;
        Ok(())
    }

    pub(crate) fn set_pages(&self, id: i64, done: usize, total: usize) -> Result<()> {
        self.conn.execute(
            "UPDATE jobs SET pages_done = ?2, pages_total = ?3, updated_at = ?4 WHERE id = ?1",
            params![id, done as i64, total as i64, now_ms()],
        )?;
        Ok(())
    }

    pub(crate) fn page_done(&self, id: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE jobs SET pages_done = pages_done + 1, updated_at = ?2 WHERE id = ?1",
            params![id, now_ms()],
        )?;
        Ok(())
    }

    /// Records an error on a job that is still downloading. A job paused or
    /// cancelled meanwhile keeps its state.
    pub(crate) fn fail(&self, id: i64, error: &str) -> Result<bool> {
        let changed = self.conn.execute(
            "UPDATE jobs SET state = 'failed', error = ?2, updated_at = ?3
             WHERE id = ?1 AND state = 'downloading'",
            params![id, error, now_ms()],
        )?;
        Ok(changed > 0)
    }

    /// Marks a job done once its archive is in place. Done wins over a pause
    /// that arrived while the archive was being written: the file exists.
    pub(crate) fn finish(&self, id: i64, path: &str) -> Result<bool> {
        let changed = self.conn.execute(
            "UPDATE jobs SET state = 'done', error = NULL, path = ?2,
             pages_done = COALESCE(pages_total, pages_done), updated_at = ?3 WHERE id = ?1",
            params![id, path, now_ms()],
        )?;
        Ok(changed > 0)
    }

    /// Deletes a job and returns it.
    pub(crate) fn remove(&self, id: i64) -> Result<Option<DownloadJob>> {
        let job = self.get(id)?;
        if job.is_some() {
            self.conn
                .execute("DELETE FROM jobs WHERE id = ?1", params![id])?;
        }
        Ok(job)
    }

    /// Deletes finished jobs from the list and returns their ids. Their
    /// archives stay in the library.
    pub(crate) fn clear_finished(&self) -> Result<Vec<i64>> {
        let mut statement = self
            .conn
            .prepare("DELETE FROM jobs WHERE state = 'done' RETURNING id")?;
        let ids = statement
            .query_map([], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(ids)
    }

    /// The series folder for `manga_id`: the one chosen before, else
    /// `preferred`, else `fallback` when another series already has
    /// `preferred`.
    pub(crate) fn series_folder(
        &self,
        manga_id: &str,
        preferred: &str,
        fallback: &str,
    ) -> Result<String> {
        let known: Option<String> = self
            .conn
            .query_row(
                "SELECT folder FROM series_folders WHERE manga_id = ?1",
                params![manga_id],
                |row| row.get(0),
            )
            .optional()?;
        if let Some(folder) = known {
            return Ok(folder);
        }
        for candidate in [preferred, fallback] {
            let taken: bool = self.conn.query_row(
                "SELECT EXISTS (SELECT 1 FROM series_folders WHERE folder = ?1 COLLATE NOCASE)",
                params![candidate],
                |row| row.get(0),
            )?;
            if !taken {
                self.conn.execute(
                    "INSERT INTO series_folders (manga_id, folder) VALUES (?1, ?2)",
                    params![manga_id, candidate],
                )?;
                return Ok(candidate.to_owned());
            }
        }
        // Two series share a title and an id prefix; the full id is unique.
        let unique = format!("{preferred} {manga_id}");
        self.conn.execute(
            "INSERT INTO series_folders (manga_id, folder) VALUES (?1, ?2)",
            params![manga_id, unique],
        )?;
        Ok(unique)
    }
}

fn job_from_row(row: &Row<'_>) -> rusqlite::Result<DownloadJob> {
    let quality: String = row.get(6)?;
    let state: String = row.get(7)?;
    let pages_total: Option<i64> = row.get(9)?;
    Ok(DownloadJob {
        id: row.get(0)?,
        chapter_id: row.get(1)?,
        manga_id: row.get(2)?,
        series_title: row.get(3)?,
        chapter_label: row.get(4)?,
        language: row.get(5)?,
        quality: parse_quality(&quality),
        state: JobState::parse(&state),
        pages_done: row.get::<_, i64>(8)?.max(0) as u32,
        pages_total: pages_total.map(|total| total.max(0) as u32),
        error: row.get(10)?,
        path: row.get(11)?,
        auto: row.get(12)?,
        added_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|id| (*id).to_owned()).collect()
    }

    #[test]
    fn enqueue_skips_chapters_already_in_the_queue() {
        let store = Store::open_in_memory().unwrap();
        let added = store
            .enqueue(&ids(&["a", "b"]), ImageQuality::Data, false)
            .unwrap();
        assert_eq!(added.len(), 2);
        let again = store
            .enqueue(&ids(&["a", "c"]), ImageQuality::DataSaver, true)
            .unwrap();
        assert_eq!(again.len(), 1);
        assert_eq!(again[0].chapter_id, "c");
        assert!(again[0].auto);
        assert_eq!(again[0].quality, ImageQuality::DataSaver);
        assert_eq!(store.jobs().unwrap().len(), 3);
    }

    #[test]
    fn failed_jobs_and_lost_archives_are_queued_again() {
        let store = Store::open_in_memory().unwrap();
        let job = store
            .enqueue(&ids(&["a"]), ImageQuality::Data, false)
            .unwrap()[0]
            .clone();
        assert!(
            store
                .transition(job.id, &[JobState::Queued], JobState::Downloading)
                .unwrap()
        );
        assert!(store.fail(job.id, "boom").unwrap());
        assert_eq!(
            store.get(job.id).unwrap().unwrap().error.as_deref(),
            Some("boom")
        );
        let again = store
            .enqueue(&ids(&["a"]), ImageQuality::Data, false)
            .unwrap();
        assert_eq!(again[0].state, JobState::Queued);
        assert_eq!(again[0].error, None);

        store.finish(job.id, "/nowhere/gone.cbz").unwrap();
        let requeued = store
            .enqueue(&ids(&["a"]), ImageQuality::Data, false)
            .unwrap();
        assert_eq!(
            requeued.len(),
            1,
            "a done job whose file is gone downloads again"
        );
    }

    #[test]
    fn reopening_requeues_interrupted_downloads() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("downloads.sqlite3");
        {
            let store = Store::open(&path).unwrap();
            let job = store
                .enqueue(&ids(&["a"]), ImageQuality::Data, false)
                .unwrap()[0]
                .clone();
            store
                .transition(job.id, &[JobState::Queued], JobState::Downloading)
                .unwrap();
            store.set_pages(job.id, 2, 5).unwrap();
        }
        let store = Store::open(&path).unwrap();
        let jobs = store.jobs().unwrap();
        assert_eq!(jobs[0].state, JobState::Queued);
        assert_eq!(jobs[0].pages_done, 2);
        assert_eq!(jobs[0].pages_total, Some(5));
    }

    #[test]
    fn a_newer_queue_is_refused() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("downloads.sqlite3");
        Connection::open(&path)
            .unwrap()
            .pragma_update(None, "user_version", 99)
            .unwrap();
        assert!(matches!(
            Store::open(&path),
            Err(DownloadError::NewerQueue(99))
        ));
    }

    #[test]
    fn series_folders_are_stable_and_unique() {
        let store = Store::open_in_memory().unwrap();
        assert_eq!(
            store.series_folder("m1", "Moon", "Moon m1").unwrap(),
            "Moon"
        );
        assert_eq!(
            store.series_folder("m1", "Moon Renamed", "x").unwrap(),
            "Moon"
        );
        assert_eq!(
            store.series_folder("m2", "moon", "moon m2").unwrap(),
            "moon m2"
        );
    }

    #[test]
    fn clearing_finished_keeps_the_rest() {
        let store = Store::open_in_memory().unwrap();
        let jobs = store
            .enqueue(&ids(&["a", "b"]), ImageQuality::Data, false)
            .unwrap();
        store.finish(jobs[0].id, "/x.cbz").unwrap();
        assert_eq!(store.clear_finished().unwrap(), vec![jobs[0].id]);
        assert_eq!(store.jobs().unwrap().len(), 1);
    }
}
