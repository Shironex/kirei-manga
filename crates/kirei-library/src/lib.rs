//! The local library: a SQLite catalogue of series and chapters, the folder
//! scanner that fills it, reading progress and reading sessions, per-series
//! settings, and the on-disk cover cache with the palette each cover seeds
//! the theme with.
//!
//! Everything here is blocking. The desktop shell calls it from
//! `spawn_blocking`; a scan reads archives on the rayon pool and holds the
//! database lock only for its final write.
//!
//! User files are only ever read. Removing a root or a vanished archive
//! changes rows in the database, never anything on disk.

mod backup;
mod civil;
mod comic_info;
mod covers;
mod db;
mod error;
mod identity;
mod model;
mod naming;
mod palette;
mod scanner;
mod settings;
mod stats;
mod tracking;
mod watcher;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use rusqlite::{Connection, OptionalExtension, params};

pub use backup::{
    BACKUP_EXTENSION, BACKUP_FORMAT, BackupManifest, BackupOptions, RestoreOutcome,
    apply_pending_restore, inspect_backup, stage_restore,
};
pub use comic_info::{ComicInfo, parse as parse_comic_info};
pub use covers::{THUMB_HEIGHT, THUMB_WIDTH};
pub use db::SCHEMA_VERSION;
pub use error::{LibraryError, Result};
pub use model::{
    ChapterEntry, CoverCacheUsage, CoverRef, LibraryRoot, OrphanPurge, ReadingProgress, ScanPhase,
    ScanProgress, ScanSummary, SeriesDetail, SeriesSummary,
};
pub use naming::{ParsedName, clean_title, parse_name, title_key};
pub use palette::{
    FALLBACK_CHROMA, FALLBACK_HUE, MAX_SEED_CHROMA, Oklch, Palette, sample as sample_palette,
    srgb_to_oklch,
};
pub use scanner::{MAX_DEPTH, ScanScope};
pub use stats::{
    IDLE_CUTOFF_MS, MAX_UTC_OFFSET_MIN, ReadingClock, ReadingDay, ReadingStats, ReadingTotals,
    SeriesReading, Streak, TOP_SERIES, local_day,
};
pub use tracking::{
    ANILIST, LinkSource, QueueSummary, QueuedUpdate, RemoteState, TrackerLink, UpdateRequest,
    local_series_key, mangadex_series_key,
};
pub use watcher::{LibraryWatcher, WatchConfig, WatchProgress};

use covers::CoverCache;

/// Milliseconds since the Unix epoch, the unit of every stored timestamp.
pub(crate) fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

/// The library database plus its cover cache. `Send + Sync`; share it behind
/// an `Arc` or as managed state.
pub struct Library {
    conn: Mutex<Connection>,
    covers: CoverCache,
    scanning: AtomicBool,
}

/// Clears the single-flight flag when a scan ends, even by panic.
struct ScanGuard<'a>(&'a AtomicBool);

impl Drop for ScanGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

impl Library {
    /// Opens (or creates) the database at `db_path` in WAL mode and migrates
    /// it. Thumbnails go to `cover_dir`.
    pub fn open(db_path: &Path, cover_dir: &Path) -> Result<Self> {
        Ok(Self {
            conn: Mutex::new(db::open_file(db_path)?),
            covers: CoverCache::new(cover_dir)?,
            scanning: AtomicBool::new(false),
        })
    }

    /// An in-memory database, for tests and previews.
    pub fn open_in_memory(cover_dir: &Path) -> Result<Self> {
        Ok(Self {
            conn: Mutex::new(db::open_memory()?),
            covers: CoverCache::new(cover_dir)?,
            scanning: AtomicBool::new(false),
        })
    }

    /// The schema version of the open database.
    pub fn schema_version(&self) -> Result<u32> {
        db::schema_version(&self.conn())
    }

    // The connection holds no state a panic could break half way: every write
    // is a transaction, which SQLite rolls back if it never commits.
    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(PoisonError::into_inner)
    }

    // --- Roots ---------------------------------------------------------------

    /// Adds a folder to scan. The path is canonicalised; a folder inside or
    /// around an existing root is refused, so no file belongs to two roots.
    pub fn add_root(&self, path: &Path) -> Result<LibraryRoot> {
        let canonical = canonical_dir(path)?;
        let path_str = canonical
            .to_str()
            .ok_or_else(|| LibraryError::NotAFolder(canonical.clone()))?
            .to_owned();
        let conn = self.conn();
        for existing in list_root_paths(&conn)? {
            let existing_path = Path::new(&existing);
            if canonical.starts_with(existing_path) || existing_path.starts_with(&canonical) {
                return Err(LibraryError::OverlappingRoot {
                    path: path_str,
                    existing,
                });
            }
        }
        conn.execute(
            "INSERT INTO library_roots (path, added_at) VALUES (?1, ?2)",
            params![path_str, now_ms()],
        )?;
        let id = conn.last_insert_rowid();
        drop(conn);
        self.root(id)?
            .ok_or(LibraryError::NotFound("library root", id))
    }

    /// Forgets a root and every series and chapter row under it. Reading
    /// progress and series settings are kept as orphans (hidden from every
    /// list) so adding the folder again, here or under another root, brings
    /// them back. Nothing on disk is touched. Returns false when the id is
    /// unknown.
    pub fn remove_root(&self, id: i64) -> Result<bool> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        tx.execute(
            "UPDATE reading_progress SET orphaned_at = ?2 WHERE chapter_id IN (
                 SELECT c.id FROM chapters c JOIN series s ON s.id = c.series_id
                 WHERE s.root_id = ?1)",
            params![id, now],
        )?;
        tx.execute(
            "UPDATE series_settings SET orphaned_at = ?2 WHERE series_id IN (
                 SELECT id FROM series WHERE root_id = ?1)",
            params![id, now],
        )?;
        let removed = tx.execute("DELETE FROM library_roots WHERE id = ?1", [id])? > 0;
        tx.commit()?;
        Ok(removed)
    }

    /// Deletes progress and settings whose chapter or series is gone and has
    /// been for at least `older_than_days` (0 purges every orphan). Never
    /// called on its own: it is for an explicit "forget old progress" action.
    pub fn purge_orphans(&self, older_than_days: u32) -> Result<OrphanPurge> {
        // A scan can adopt orphans again, so the two never overlap.
        let _guard = self.begin_scan()?;
        let cutoff = now_ms() - i64::from(older_than_days) * 86_400_000;
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let progress = tx.execute(
            "DELETE FROM reading_progress
             WHERE chapter_id IS NULL AND coalesce(orphaned_at, updated_at) <= ?1",
            [cutoff],
        )?;
        let settings = tx.execute(
            "DELETE FROM series_settings
             WHERE series_id IS NULL AND coalesce(orphaned_at, updated_at) <= ?1",
            [cutoff],
        )?;
        tx.commit()?;
        Ok(OrphanPurge { progress, settings })
    }

    /// How many orphans [`Self::purge_orphans`]`(0)` would delete, without
    /// deleting anything.
    pub fn count_orphans(&self) -> Result<OrphanPurge> {
        let conn = self.conn();
        let count = |sql: &str| -> Result<usize> {
            let n: i64 = conn.query_row(sql, [], |row| row.get(0))?;
            Ok(usize::try_from(n).unwrap_or_default())
        };
        Ok(OrphanPurge {
            progress: count("SELECT count(*) FROM reading_progress WHERE chapter_id IS NULL")?,
            settings: count("SELECT count(*) FROM series_settings WHERE series_id IS NULL")?,
        })
    }

    pub fn roots(&self) -> Result<Vec<LibraryRoot>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(
            "SELECT r.id, r.path, r.added_at, r.last_scan_at,
                    (SELECT count(*) FROM series s WHERE s.root_id = r.id)
             FROM library_roots r ORDER BY r.path",
        )?;
        let rows = stmt.query_map([], root_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    fn root(&self, id: i64) -> Result<Option<LibraryRoot>> {
        Ok(self
            .conn()
            .query_row(
                "SELECT r.id, r.path, r.added_at, r.last_scan_at,
                        (SELECT count(*) FROM series s WHERE s.root_id = r.id)
                 FROM library_roots r WHERE r.id = ?1",
                [id],
                root_from_row,
            )
            .optional()?)
    }

    // --- Scanning ------------------------------------------------------------

    /// Scans one root, or every root when `root_id` is `None`. Only one scan
    /// runs at a time; a second call fails fast with
    /// [`LibraryError::ScanInProgress`]. `progress` is called from worker
    /// threads, throttled.
    pub fn scan(
        &self,
        root_id: Option<i64>,
        progress: &(dyn Fn(ScanProgress) + Sync),
    ) -> Result<ScanSummary> {
        self.run_scan(
            |conn| match root_id {
                Some(id) => Ok(vec![(
                    id,
                    scanner::root_path(conn, id)?
                        .ok_or(LibraryError::NotFound("library root", id))?,
                    None,
                )]),
                None => {
                    let mut stmt =
                        conn.prepare_cached("SELECT id, path FROM library_roots ORDER BY path")?;
                    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, None)))?;
                    Ok(rows.collect::<rusqlite::Result<_>>()?)
                }
            },
            progress,
        )
    }

    /// Rescans only part of a root: the series folders and loose archives
    /// `scope` names. Same incremental rules, single-flight flag and progress
    /// events as [`Library::scan`]; chapters outside the scope are left as
    /// they are, and the entries are rescanned even when nothing in them
    /// changed ([`Library::scan_changed`] skips those).
    pub fn scan_entries(
        &self,
        root_id: i64,
        scope: &ScanScope,
        progress: &(dyn Fn(ScanProgress) + Sync),
    ) -> Result<ScanSummary> {
        self.run_scan(
            |conn| {
                let path = scanner::root_path(conn, root_id)?
                    .ok_or(LibraryError::NotFound("library root", root_id))?;
                Ok(vec![(root_id, path, Some(scope.clone()))])
            },
            progress,
        )
    }

    /// The series folders and loose archives of a root that no longer match
    /// the database, found from folder listings and file sizes and mtimes
    /// alone (no archive is opened). `None` when the root cannot be read, as
    /// with an unplugged drive. An empty scope means nothing changed.
    pub fn changed_entries(&self, root_id: i64) -> Result<Option<ScanScope>> {
        let path = self.root_path(root_id)?;
        scanner::changed_entries(&self.conn, root_id, &path, None)
    }

    /// Catches a root up with changes made while nothing watched it (the app
    /// was closed): [`Library::scan_changed`] over the whole root.
    pub fn catch_up(
        &self,
        root_id: i64,
        progress: &(dyn Fn(ScanProgress) + Sync),
    ) -> Result<Option<ScanSummary>> {
        self.scan_changed(root_id, None, progress)
    }

    /// Rescans the entries of a root, or of `within` when given, that
    /// [`Library::changed_entries`] would report, with the same progress
    /// events as any scan. Returns `None`, sending no events, when nothing
    /// changed or the root cannot be read; an unreadable root marks nothing
    /// missing. Single-flight like every scan. The watcher rescans through
    /// this, so a change notice that changed nothing the scanner reads (an
    /// attribute touched, metadata flushed late) costs no scan.
    pub fn scan_changed(
        &self,
        root_id: i64,
        within: Option<&ScanScope>,
        progress: &(dyn Fn(ScanProgress) + Sync),
    ) -> Result<Option<ScanSummary>> {
        let path = self.root_path(root_id)?;
        // Look first without the single-flight flag, so a check that finds
        // nothing (the usual launch catch-up) never makes a manual scan
        // started at the same moment fail with ScanInProgress.
        match scanner::changed_entries(&self.conn, root_id, &path, within)? {
            Some(scope) if !scope.is_empty() => {}
            _ => return Ok(None),
        }
        let _guard = self.begin_scan()?;
        match scanner::changed_entries(&self.conn, root_id, &path, within)? {
            Some(scope) if !scope.is_empty() => self
                .scan_roots(&[(root_id, path, Some(scope))], progress)
                .map(Some),
            _ => Ok(None),
        }
    }

    fn root_path(&self, root_id: i64) -> Result<String> {
        scanner::root_path(&self.conn(), root_id)?
            .ok_or(LibraryError::NotFound("library root", root_id))
    }

    /// Takes the single-flight flag, or fails when a scan already holds it.
    fn begin_scan(&self) -> Result<ScanGuard<'_>> {
        if self.scanning.swap(true, Ordering::AcqRel) {
            return Err(LibraryError::ScanInProgress);
        }
        Ok(ScanGuard(&self.scanning))
    }

    fn run_scan(
        &self,
        roots: impl FnOnce(&Connection) -> Result<Vec<(i64, String, Option<ScanScope>)>>,
        progress: &(dyn Fn(ScanProgress) + Sync),
    ) -> Result<ScanSummary> {
        let _guard = self.begin_scan()?;
        let roots = roots(&self.conn())?;
        self.scan_roots(&roots, progress)
    }

    /// Scans `roots` in order. The caller holds the single-flight flag.
    fn scan_roots(
        &self,
        roots: &[(i64, String, Option<ScanScope>)],
        progress: &(dyn Fn(ScanProgress) + Sync),
    ) -> Result<ScanSummary> {
        let start = Instant::now();
        let mut summary = ScanSummary::default();
        for (id, path, scope) in roots {
            scanner::scan_root(
                &self.conn,
                &self.covers,
                *id,
                path,
                scope.as_ref(),
                progress,
                &mut summary,
            )?;
            summary.roots += 1;
        }
        summary.elapsed_ms = start.elapsed().as_secs_f64() * 1000.0;
        progress(ScanProgress {
            phase: ScanPhase::Done,
            root: String::new(),
            done: summary.roots,
            total: roots.len(),
            current: None,
        });
        Ok(summary)
    }

    /// True while a scan runs.
    pub fn is_scanning(&self) -> bool {
        self.scanning.load(Ordering::Acquire)
    }

    // --- Reading the catalogue -----------------------------------------------

    /// Every series, sorted by title.
    pub fn series(&self) -> Result<Vec<SeriesSummary>> {
        let conn = self.conn();
        let continues = continue_chapters(&conn, None)?;
        let mut stmt =
            conn.prepare_cached(&format!("{SERIES_SELECT} ORDER BY s.sort_title, s.id"))?;
        let rows = stmt.query_map([], |row| self.summary_from_row(row))?;
        let mut out: Vec<SeriesSummary> = rows.collect::<rusqlite::Result<_>>()?;
        for series in &mut out {
            series.continue_chapter_id = continues.get(&series.id).copied().flatten();
        }
        Ok(out)
    }

    /// One series with its chapters in reading order and their progress.
    pub fn series_detail(&self, id: i64) -> Result<Option<SeriesDetail>> {
        let conn = self.conn();
        let Some((mut summary, extra)) = conn
            .query_row(&format!("{SERIES_SELECT} WHERE s.id = ?1"), [id], |row| {
                Ok((
                    self.summary_from_row(row)?,
                    (
                        row.get::<_, Option<String>>(14)?,
                        row.get::<_, Option<String>>(15)?,
                        row.get::<_, Option<i64>>(16)?,
                        row.get::<_, Option<String>>(17)?,
                        row.get::<_, Option<String>>(18)?,
                        row.get::<_, Option<String>>(19)?,
                    ),
                ))
            })
            .optional()?
        else {
            return Ok(None);
        };
        summary.continue_chapter_id = continue_chapters(&conn, Some(id))?
            .get(&id)
            .copied()
            .flatten();

        let mut stmt = conn.prepare_cached(
            "SELECT c.id, c.path, c.kind, c.title, c.volume, c.number, c.page_count, c.language,
                    c.scan_group, c.missing, c.error,
                    p.page, p.page_count, p.completed, p.updated_at
             FROM chapters c LEFT JOIN reading_progress p ON p.chapter_id = c.id
             WHERE c.series_id = ?1 ORDER BY c.sort_order, c.id",
        )?;
        let chapters = stmt
            .query_map([id], |row| {
                let chapter_id: i64 = row.get(0)?;
                let kind: String = row.get(2)?;
                let progress = match row.get::<_, Option<i64>>(11)? {
                    Some(page) => Some(ReadingProgress {
                        chapter_id,
                        page,
                        page_count: row.get(12)?,
                        completed: row.get(13)?,
                        updated_at: row.get(14)?,
                    }),
                    None => None,
                };
                Ok(ChapterEntry {
                    id: chapter_id,
                    path: row.get(1)?,
                    kind: match kind.as_str() {
                        "rar" => kirei_core::SourceKind::Rar,
                        "folder" => kirei_core::SourceKind::Folder,
                        _ => kirei_core::SourceKind::Zip,
                    },
                    title: row.get(3)?,
                    volume: row.get(4)?,
                    number: row.get(5)?,
                    page_count: row.get(6)?,
                    language: row.get(7)?,
                    scan_group: row.get(8)?,
                    missing: row.get(9)?,
                    error: row.get(10)?,
                    progress,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let (description, writer, year, language, genres, manga) = extra;
        Ok(Some(SeriesDetail {
            summary,
            description,
            writer,
            year,
            language,
            genres: genres
                .map(|g| g.split(", ").map(str::to_owned).collect())
                .unwrap_or_default(),
            manga,
            chapters,
        }))
    }

    fn summary_from_row(&self, row: &rusqlite::Row<'_>) -> rusqlite::Result<SeriesSummary> {
        let cover = match row.get::<_, Option<String>>(7)? {
            Some(hash) => {
                let file: String = row.get(8)?;
                let palette: String = row.get(11)?;
                let palette = serde_json::from_str(&palette).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        11,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Some(CoverRef {
                    hash,
                    path: self.covers.absolute(&file).to_string_lossy().into_owned(),
                    width: row.get(9)?,
                    height: row.get(10)?,
                    palette,
                })
            }
            None => None,
        };
        Ok(SeriesSummary {
            id: row.get(0)?,
            root_id: row.get(1)?,
            title: row.get(2)?,
            path: row.get(3)?,
            missing: row.get(4)?,
            added_at: row.get(5)?,
            updated_at: row.get(6)?,
            cover,
            chapter_count: row.get(12)?,
            missing_count: row.get(20)?,
            completed_count: row.get(13)?,
            last_read_at: row.get(21)?,
            new_count: row.get(22)?,
            continue_chapter_id: None,
        })
    }

    /// Directory the thumbnails live in.
    pub fn cover_dir(&self) -> &Path {
        self.covers.dir()
    }

    /// Bytes and files the cover thumbnails take on disk.
    pub fn cover_cache_usage(&self) -> Result<CoverCacheUsage> {
        self.covers.usage()
    }

    /// Deletes every cover thumbnail and returns what was freed. The next
    /// scan makes them again. Refused while a scan runs, since the scan may
    /// be writing thumbnails at that moment.
    pub fn clear_cover_cache(&self) -> Result<CoverCacheUsage> {
        let _guard = self.begin_scan()?;
        self.covers.clear()
    }

    /// Thumbnail files no series points at (deleted series, older cover rule
    /// versions): what [`Self::prune_covers`] would free.
    pub fn unused_covers(&self) -> Result<CoverCacheUsage> {
        let keep = self.referenced_cover_files()?;
        self.covers.unreferenced(&keep)
    }

    /// Deletes the thumbnails no series points at and the `covers` rows that
    /// described them, and returns what was freed. Thumbnails in use stay.
    /// Refused while a scan runs, like [`Self::clear_cover_cache`].
    pub fn prune_covers(&self) -> Result<CoverCacheUsage> {
        let _guard = self.begin_scan()?;
        let keep = self.referenced_cover_files()?;
        let freed = self.covers.prune(&keep)?;
        self.conn().execute(
            "DELETE FROM covers WHERE hash NOT IN
                 (SELECT cover_hash FROM series WHERE cover_hash IS NOT NULL)",
            [],
        )?;
        Ok(freed)
    }

    /// Relative paths of the thumbnails some series uses.
    fn referenced_cover_files(&self) -> Result<std::collections::HashSet<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(
            "SELECT DISTINCT c.file FROM covers c JOIN series s ON s.cover_hash = c.hash",
        )?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Where the thumbnail for a cover hash would be, or `None` when `hash`
    /// is not a cover hash (64 lowercase hex digits). The path is built only
    /// from the validated hash, so nothing a caller passes can point outside
    /// the cache. The file may still be missing.
    pub fn cover_path(&self, hash: &str) -> Option<PathBuf> {
        CoverCache::is_hash(hash).then(|| self.covers.absolute(&CoverCache::relative_file(hash)))
    }

    // --- Progress and settings -----------------------------------------------

    /// Records that `page` (0 based) of a chapter is on screen. Reaching the
    /// last page marks the chapter completed, and completion sticks when the
    /// chapter is reread from the start.
    pub fn record_progress(&self, chapter_id: i64, page: i64) -> Result<ReadingProgress> {
        upsert_progress(&self.conn(), chapter_id, page, now_ms())
    }

    /// The settings blob saved for a series, if any.
    pub fn series_settings(&self, series_id: i64) -> Result<Option<serde_json::Value>> {
        let text: Option<String> = self
            .conn()
            .query_row(
                "SELECT settings FROM series_settings WHERE series_id = ?1",
                [series_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(text.map(|t| serde_json::from_str(&t)).transpose()?)
    }

    /// Replaces the settings blob of a series.
    pub fn set_series_settings(&self, series_id: i64, settings: &serde_json::Value) -> Result<()> {
        let conn = self.conn();
        let exists: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM series WHERE id = ?1)",
            [series_id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(LibraryError::NotFound("series", series_id));
        }
        conn.execute(
            "INSERT INTO series_settings (series_id, ident, settings, updated_at)
             SELECT id, ident, ?2, ?3 FROM series WHERE id = ?1
             ON CONFLICT (series_id) DO UPDATE SET
                 settings = excluded.settings, updated_at = excluded.updated_at",
            params![series_id, serde_json::to_string(settings)?, now_ms()],
        )?;
        Ok(())
    }
}

/// Writes the progress row of a chapter at `now`; see
/// [`Library::record_progress`].
pub(crate) fn upsert_progress(
    conn: &Connection,
    chapter_id: i64,
    page: i64,
    now: i64,
) -> Result<ReadingProgress> {
    let page_count: i64 = conn
        .query_row(
            "SELECT page_count FROM chapters WHERE id = ?1",
            [chapter_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or(LibraryError::NotFound("chapter", chapter_id))?;
    let page = page.clamp(0, (page_count - 1).max(0));
    let completed = page_count > 0 && page + 1 >= page_count;
    Ok(conn.query_row(
        "INSERT INTO reading_progress
             (chapter_id, ident, file_size, page, page_count, completed, updated_at)
         SELECT id, ident, file_size, ?2, ?3, ?4, ?5 FROM chapters WHERE id = ?1
         ON CONFLICT (chapter_id) DO UPDATE SET
             ident = excluded.ident,
             file_size = excluded.file_size,
             page = excluded.page,
             page_count = excluded.page_count,
             completed = max(reading_progress.completed, excluded.completed),
             updated_at = excluded.updated_at
         RETURNING chapter_id, page, page_count, completed, updated_at",
        params![chapter_id, page, page_count, completed, now],
        |row| {
            Ok(ReadingProgress {
                chapter_id: row.get(0)?,
                page: row.get(1)?,
                page_count: row.get(2)?,
                completed: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )?)
}

/// Columns 0..=13 feed [`Library::summary_from_row`]; 14..=19 are the detail
/// fields; 20 and 21 are the missing count and last read time; 22 counts
/// chapters added since the series was last read.
const SERIES_SELECT: &str =
    "SELECT s.id, s.root_id, s.title, s.path, s.missing, s.added_at, s.updated_at,
        cv.hash, cv.file, cv.width, cv.height, cv.palette,
        (SELECT count(*) FROM chapters c WHERE c.series_id = s.id AND c.missing = 0),
        (SELECT count(*) FROM chapters c JOIN reading_progress p ON p.chapter_id = c.id
          WHERE c.series_id = s.id AND p.completed = 1),
        s.description, s.writer, s.year, s.language, s.genres, s.manga,
        (SELECT count(*) FROM chapters c WHERE c.series_id = s.id AND c.missing = 1),
        (SELECT max(p.updated_at) FROM chapters c JOIN reading_progress p ON p.chapter_id = c.id
          WHERE c.series_id = s.id),
        (SELECT count(*) FROM chapters c
          LEFT JOIN reading_progress p ON p.chapter_id = c.id
          WHERE c.series_id = s.id AND c.missing = 0 AND coalesce(p.completed, 0) = 0
            AND c.added_at > (SELECT max(p2.updated_at) FROM chapters c2
              JOIN reading_progress p2 ON p2.chapter_id = c2.id WHERE c2.series_id = s.id))
     FROM series s LEFT JOIN covers cv ON cv.hash = s.cover_hash";

fn root_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<LibraryRoot> {
    Ok(LibraryRoot {
        id: row.get(0)?,
        path: row.get(1)?,
        added_at: row.get(2)?,
        last_scan_at: row.get(3)?,
        series_count: row.get(4)?,
    })
}

fn list_root_paths(conn: &Connection) -> Result<Vec<String>> {
    let mut stmt = conn.prepare_cached("SELECT path FROM library_roots")?;
    let rows = stmt.query_map([], |row| row.get(0))?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// The chapter "continue" opens, per series: the most recently read chapter
/// if unfinished, else the next unfinished present chapter after it, else the
/// first present chapter when nothing has been read.
fn continue_chapters(conn: &Connection, series: Option<i64>) -> Result<HashMap<i64, Option<i64>>> {
    struct Row {
        series_id: i64,
        chapter_id: i64,
        missing: bool,
        completed: bool,
        read_at: Option<i64>,
    }
    let mut stmt = conn.prepare_cached(
        "SELECT c.series_id, c.id, c.missing, coalesce(p.completed, 0), p.updated_at
         FROM chapters c LEFT JOIN reading_progress p ON p.chapter_id = c.id
         WHERE ?1 IS NULL OR c.series_id = ?1
         ORDER BY c.series_id, c.sort_order, c.id",
    )?;
    let rows = stmt
        .query_map([series], |row| {
            Ok(Row {
                series_id: row.get(0)?,
                chapter_id: row.get(1)?,
                missing: row.get(2)?,
                completed: row.get(3)?,
                read_at: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut out = HashMap::new();
    for group in rows.chunk_by(|a, b| a.series_id == b.series_id) {
        let last_read = group
            .iter()
            .enumerate()
            .filter_map(|(i, r)| r.read_at.map(|at| (at, i)))
            .max();
        let pick = match last_read {
            Some((_, index)) if !group[index].completed && !group[index].missing => {
                Some(group[index].chapter_id)
            }
            Some((_, index)) => group[index + 1..]
                .iter()
                .find(|r| !r.completed && !r.missing)
                .map(|r| r.chapter_id),
            None => group.iter().find(|r| !r.missing).map(|r| r.chapter_id),
        };
        out.insert(group[0].series_id, pick);
    }
    Ok(out)
}

fn canonical_dir(path: &Path) -> Result<PathBuf> {
    let canonical = std::fs::canonicalize(path).map_err(|source| LibraryError::io(path, source))?;
    if !canonical.is_dir() {
        return Err(LibraryError::NotAFolder(path.to_path_buf()));
    }
    Ok(strip_verbatim(canonical))
}

/// Windows `canonicalize` returns `\\?\C:\...`; store the plain form users
/// and other APIs expect. UNC shares (`\\?\UNC\server\share`) map back to
/// `\\server\share`.
fn strip_verbatim(path: PathBuf) -> PathBuf {
    let Some(text) = path.to_str() else {
        return path;
    };
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    match text.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => PathBuf::from(rest),
        _ => path,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verbatim_prefixes_are_stripped() {
        assert_eq!(
            strip_verbatim(PathBuf::from(r"\\?\C:\Manga")),
            PathBuf::from(r"C:\Manga")
        );
        assert_eq!(
            strip_verbatim(PathBuf::from(r"\\?\UNC\nas\manga")),
            PathBuf::from(r"\\nas\manga")
        );
        assert_eq!(
            strip_verbatim(PathBuf::from("/Users/me/Manga")),
            PathBuf::from("/Users/me/Manga")
        );
    }
}
