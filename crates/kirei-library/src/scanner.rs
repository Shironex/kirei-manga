//! Walks a library root into series and chapters and syncs the database.
//!
//! Layout rules, loosest first:
//!
//! - Each folder directly inside a root is a series. Every archive under it
//!   (down to [`MAX_DEPTH`] levels) is a chapter, and every folder that holds
//!   images directly is a chapter too. A folder named like a volume
//!   (`Vol 02`, `Tom 2`) lends its number to the chapters inside it.
//! - Archives loose in the root are grouped into series by the title parsed
//!   from their names, so `[Group] Title - 011.cbz` and `Title - 012.cbz` land
//!   in one series and `Other.cbz` becomes a series of its own.
//!
//! A rescan is incremental: a chapter whose size and mtime match the database
//! is not opened again. Archives are opened read-only through kirei-archive;
//! the scanner never writes, moves or deletes anything in a root. Chapters
//! that disappear are marked missing, never dropped, so their progress
//! survives an unplugged drive.

use std::collections::{HashMap, HashSet};
use std::fs::Metadata;
use std::path::Path;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant, UNIX_EPOCH};

use kirei_archive::{OpenOptions, natural_cmp};
use kirei_core::{ImageFormat, SourceKind};
use rayon::prelude::*;
use rusqlite::{Connection, OptionalExtension, params};

use crate::comic_info::{self, ComicInfo};
use crate::covers::{CoverCache, NewCover};
use crate::identity::{chapter_ident, series_ident};
use crate::model::{ScanPhase, ScanProgress, ScanSummary};
use crate::naming::{ParsedName, clean_title, parse_name, title_key};
use crate::{Result, now_ms};

/// How deep under a series folder chapters are looked for.
pub const MAX_DEPTH: usize = 4;
const ARCHIVE_EXTENSIONS: [&str; 4] = ["cbz", "zip", "cbr", "rar"];
/// Progress reports inside a phase are at least this far apart.
const REPORT_INTERVAL: Duration = Duration::from_millis(50);

pub(crate) type ProgressFn<'a> = &'a (dyn Fn(ScanProgress) + Sync);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CandidateKind {
    Archive,
    Folder,
}

#[derive(Debug, Clone)]
struct Candidate {
    path: String,
    kind: CandidateKind,
    size: i64,
    mtime: i64,
    parsed: ParsedName,
}

#[derive(Debug)]
struct SeriesCandidate {
    key: String,
    path: String,
    title: String,
    chapters: Vec<Candidate>,
}

/// What the database knows about a chapter, enough to skip reopening it.
#[derive(Debug, Clone)]
struct KnownChapter {
    id: i64,
    size: i64,
    mtime: i64,
    missing: bool,
    error: Option<String>,
    data: ChapterData,
}

#[derive(Debug, Clone)]
struct KnownSeries {
    title: String,
    title_from_info: bool,
    cover_hash: Option<String>,
    cover_source: Option<String>,
}

#[derive(Debug, Clone)]
struct ChapterData {
    kind: SourceKind,
    title: Option<String>,
    volume: Option<f64>,
    number: Option<f64>,
    page_count: i64,
    cover_page: i64,
    language: Option<String>,
    scan_group: Option<String>,
    error: Option<String>,
    info: Option<ComicInfo>,
}

enum Status {
    Added,
    Updated,
    Unchanged(i64),
}

struct PlannedChapter {
    candidate: Candidate,
    data: ChapterData,
    status: Status,
}

struct PlannedSeries {
    candidate_key: String,
    path: String,
    title: String,
    title_from_info: bool,
    meta: Option<ComicInfo>,
    chapters: Vec<PlannedChapter>,
    cover_hash: Option<String>,
    cover_source: Option<String>,
    changed: bool,
}

struct CoverJob {
    series: usize,
    path: String,
    page: usize,
    source: String,
}

enum CoverOutcome {
    Known(String),
    Made(NewCover),
    Failed,
}

/// Throttles progress reports to one per [`REPORT_INTERVAL`] within a phase.
struct Reporter<'a> {
    sink: ProgressFn<'a>,
    root: String,
    last: Mutex<Option<Instant>>,
}

impl Reporter<'_> {
    fn report(&self, phase: ScanPhase, done: usize, total: usize, current: Option<&str>) {
        let force = done == 0 || done >= total;
        {
            let mut last = self
                .last
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            if !force && last.is_some_and(|at| at.elapsed() < REPORT_INTERVAL) {
                return;
            }
            *last = Some(Instant::now());
        }
        (self.sink)(ScanProgress {
            phase,
            root: self.root.clone(),
            done,
            total,
            current: current.map(str::to_owned),
        });
    }
}

/// Scans one root and writes the result. The database lock is held only to
/// read the known chapters and for the final write transaction; archives are
/// read in parallel outside it.
pub(crate) fn scan_root(
    conn: &Mutex<Connection>,
    covers: &CoverCache,
    root_id: i64,
    root_path: &str,
    progress: ProgressFn<'_>,
    summary: &mut ScanSummary,
) -> Result<()> {
    let reporter = Reporter {
        sink: progress,
        root: root_path.to_owned(),
        last: Mutex::new(None),
    };
    reporter.report(ScanPhase::Discovering, 0, 1, None);
    let discovered = match discover(Path::new(root_path)) {
        Ok(found) => found,
        Err(error) => {
            // An unplugged drive: everything under it becomes missing below.
            summary.root_errors.push(format!("{root_path}: {error}"));
            Vec::new()
        }
    };
    reporter.report(ScanPhase::Discovering, 1, 1, None);

    let (known_chapters, known_series, known_covers) = {
        let conn = lock(conn);
        load_known(&conn, root_id)?
    };

    // Read new and changed chapters in parallel.
    let to_read: Vec<&Candidate> = discovered
        .iter()
        .flat_map(|series| &series.chapters)
        .filter(|candidate| !is_unchanged(candidate, known_chapters.get(&candidate.path)))
        .collect();
    let total = to_read.len();
    let done = AtomicUsize::new(0);
    reporter.report(ScanPhase::Reading, 0, total, None);
    let read: HashMap<String, ChapterData> = to_read
        .par_iter()
        .map(|candidate| {
            let data = read_chapter(candidate);
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            reporter.report(ScanPhase::Reading, n, total, Some(&candidate.path));
            (candidate.path.clone(), data)
        })
        .collect();
    reporter.report(ScanPhase::Reading, total, total, None);

    let mut planned = plan(discovered, &known_chapters, &known_series, read);

    // Covers: one per series, from its first readable chapter.
    let jobs = cover_jobs(&planned, &known_series, &known_covers, covers);
    let total = jobs.len();
    let done = AtomicUsize::new(0);
    // Hashes some worker is already turning into a thumbnail in this scan,
    // so a cover shared by two series is decoded once.
    let claimed = Mutex::new(HashSet::new());
    reporter.report(ScanPhase::Covers, 0, total, None);
    let outcomes: Vec<(usize, String, CoverOutcome)> = jobs
        .par_iter()
        .map(|job| {
            let outcome = make_cover(covers, &known_covers, &claimed, job);
            let n = done.fetch_add(1, Ordering::Relaxed) + 1;
            reporter.report(ScanPhase::Covers, n, total, Some(&job.path));
            (job.series, job.source.clone(), outcome)
        })
        .collect();
    let mut new_covers = Vec::new();
    for (_, _, outcome) in &outcomes {
        if let CoverOutcome::Made(cover) = outcome {
            new_covers.push(cover.clone());
        }
    }
    for (series, source, outcome) in outcomes {
        let entry = &mut planned[series];
        entry.cover_source = Some(source);
        entry.changed = true;
        entry.cover_hash = match outcome {
            // A hash claimed by a worker whose decode failed has no row.
            CoverOutcome::Known(hash)
                if known_covers.contains_key(&hash)
                    || new_covers.iter().any(|c| c.hash == hash) =>
            {
                Some(hash)
            }
            CoverOutcome::Made(cover) => Some(cover.hash),
            CoverOutcome::Known(_) | CoverOutcome::Failed => None,
        };
    }
    summary.covers_made += new_covers.len();

    reporter.report(ScanPhase::Saving, 0, 1, None);
    {
        let mut conn = lock(conn);
        write(
            &mut conn,
            root_id,
            &planned,
            &known_chapters,
            &new_covers,
            summary,
        )?;
    }
    reporter.report(ScanPhase::Saving, 1, 1, None);
    Ok(())
}

fn lock(conn: &Mutex<Connection>) -> std::sync::MutexGuard<'_, Connection> {
    conn.lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
}

fn is_unchanged(candidate: &Candidate, known: Option<&KnownChapter>) -> bool {
    known.is_some_and(|known| {
        known.size == candidate.size && known.mtime == candidate.mtime && known.error.is_none()
    })
}

// --- Discovery -------------------------------------------------------------

/// Names that are never library content: hidden files, OS and NAS metadata.
fn is_junk(name: &str) -> bool {
    name.starts_with('.')
        || matches!(
            name,
            "__MACOSX" | "@eaDir" | "#recycle" | "$RECYCLE.BIN" | "System Volume Information"
        )
}

fn extension(name: &str) -> Option<String> {
    name.rsplit_once('.')
        .map(|(_, ext)| ext.to_ascii_lowercase())
}

fn is_archive(name: &str) -> bool {
    extension(name).is_some_and(|ext| ARCHIVE_EXTENSIONS.contains(&ext.as_str()))
}

fn is_image(name: &str) -> bool {
    extension(name).is_some_and(|ext| ImageFormat::from_extension(&ext).is_some())
}

fn stem(name: &str) -> &str {
    name.rsplit_once('.').map_or(name, |(stem, _)| stem)
}

fn mtime_ms(metadata: &Metadata) -> i64 {
    metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |d| i64::try_from(d.as_millis()).unwrap_or(i64::MAX))
}

fn size_of(metadata: &Metadata) -> i64 {
    i64::try_from(metadata.len()).unwrap_or(i64::MAX)
}

/// Directory entries as (UTF-8 name, path, metadata), sorted by name.
/// Symlinks are followed. Names that are not valid Unicode are skipped, as in
/// kirei-archive, since they cannot round-trip through the webview.
fn entries(dir: &Path) -> std::io::Result<Vec<(String, std::path::PathBuf, Metadata)>> {
    let mut out = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let Ok(entry) = entry else { continue };
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if is_junk(&name) {
            continue;
        }
        let path = entry.path();
        let Ok(metadata) = std::fs::metadata(&path) else {
            continue;
        };
        out.push((name, path, metadata));
    }
    out.sort_by(|a, b| natural_cmp(&a.0, &b.0));
    Ok(out)
}

fn path_string(path: &Path) -> Option<String> {
    path.to_str().map(str::to_owned)
}

fn discover(root: &Path) -> std::io::Result<Vec<SeriesCandidate>> {
    let root_string = root.to_string_lossy().into_owned();
    let mut series = Vec::new();
    let mut loose: HashMap<String, SeriesCandidate> = HashMap::new();
    for (name, path, metadata) in entries(root)? {
        let Some(path_str) = path_string(&path) else {
            continue;
        };
        if metadata.is_dir() {
            let mut chapters = Vec::new();
            collect_chapters(&path, &name, 0, None, &mut chapters);
            if !chapters.is_empty() {
                series.push(SeriesCandidate {
                    key: format!("dir:{path_str}"),
                    path: path_str,
                    title: clean_title(&name),
                    chapters,
                });
            }
        } else if is_archive(&name) {
            let parsed = parse_name(stem(&name));
            let title = parsed
                .title
                .clone()
                .unwrap_or_else(|| clean_title(stem(&name)));
            let mut key = title_key(&title);
            if key.is_empty() {
                key = stem(&name).to_owned();
            }
            let entry = loose.entry(key.clone()).or_insert_with(|| SeriesCandidate {
                key: format!("loose:{root_string}:{key}"),
                path: root_string.clone(),
                title,
                chapters: Vec::new(),
            });
            entry.chapters.push(Candidate {
                path: path_str,
                kind: CandidateKind::Archive,
                size: size_of(&metadata),
                mtime: mtime_ms(&metadata),
                parsed,
            });
        }
    }
    series.extend(loose.into_values());
    series.sort_by(|a, b| a.key.cmp(&b.key));
    Ok(series)
}

fn collect_chapters(
    dir: &Path,
    name: &str,
    depth: usize,
    volume_hint: Option<f64>,
    out: &mut Vec<Candidate>,
) {
    let Ok(listing) = entries(dir) else { return };
    let mut images = 0usize;
    let mut image_bytes = 0i64;
    let mut newest = std::fs::metadata(dir).map_or(0, |m| mtime_ms(&m));
    let mut subdirs = Vec::new();
    for (entry_name, path, metadata) in listing {
        if metadata.is_dir() {
            subdirs.push((entry_name, path));
        } else if is_archive(&entry_name) {
            let Some(path) = path_string(&path) else {
                continue;
            };
            let mut parsed = parse_name(stem(&entry_name));
            parsed.volume = parsed.volume.or(volume_hint);
            out.push(Candidate {
                path,
                kind: CandidateKind::Archive,
                size: size_of(&metadata),
                mtime: mtime_ms(&metadata),
                parsed,
            });
        } else if is_image(&entry_name) {
            images += 1;
            image_bytes = image_bytes.saturating_add(size_of(&metadata));
            newest = newest.max(mtime_ms(&metadata));
        }
    }
    if images > 0
        && let Some(path) = path_string(dir)
    {
        let mut parsed = parse_name(name);
        parsed.volume = parsed.volume.or(volume_hint);
        out.push(Candidate {
            path,
            kind: CandidateKind::Folder,
            size: image_bytes,
            mtime: newest,
            parsed,
        });
    }
    if depth + 1 > MAX_DEPTH {
        return;
    }
    for (sub_name, sub_path) in subdirs {
        let parsed = parse_name(&sub_name);
        let hint = match (parsed.volume, parsed.chapter) {
            (Some(volume), None) => Some(volume),
            _ => volume_hint,
        };
        collect_chapters(&sub_path, &sub_name, depth + 1, hint, out);
    }
}

// --- Reading ---------------------------------------------------------------

fn read_chapter(candidate: &Candidate) -> ChapterData {
    let options = OpenOptions {
        probe_dimensions: false,
        ..OpenOptions::default()
    };
    let parsed = &candidate.parsed;
    match kirei_archive::open_with(Path::new(&candidate.path), &options) {
        Ok(source) => {
            let info = source
                .comic_info()
                .ok()
                .flatten()
                .map(|bytes| comic_info::parse(&bytes));
            let pages = source.len();
            let field = |f: fn(&ComicInfo) -> Option<String>| info.as_ref().and_then(f);
            ChapterData {
                kind: source.kind(),
                title: field(|i| i.title.clone()).or_else(|| parsed.chapter_title.clone()),
                volume: info.as_ref().and_then(|i| i.volume).or(parsed.volume),
                number: info.as_ref().and_then(|i| i.number).or(parsed.chapter),
                page_count: i64::try_from(pages).unwrap_or(i64::MAX),
                cover_page: info
                    .as_ref()
                    .and_then(|i| i.front_cover)
                    .filter(|page| *page < pages)
                    .map_or(0, |page| i64::try_from(page).unwrap_or(0)),
                language: field(|i| i.language.clone()),
                scan_group: field(|i| i.scan_group.clone()).or_else(|| parsed.group.clone()),
                error: (pages == 0).then(|| "no image pages".to_owned()),
                info,
            }
        }
        Err(error) => ChapterData {
            kind: guess_kind(candidate),
            title: parsed.chapter_title.clone(),
            volume: parsed.volume,
            number: parsed.chapter,
            page_count: 0,
            cover_page: 0,
            language: None,
            scan_group: parsed.group.clone(),
            error: Some(error.to_string()),
            info: None,
        },
    }
}

fn guess_kind(candidate: &Candidate) -> SourceKind {
    match (candidate.kind, extension(&candidate.path).as_deref()) {
        (CandidateKind::Folder, _) => SourceKind::Folder,
        (_, Some("cbr" | "rar")) => SourceKind::Rar,
        _ => SourceKind::Zip,
    }
}

// --- Planning --------------------------------------------------------------

/// Reading order: numbered chapters by number (then volume), then the rest by
/// volume, then natural path order as the tie break.
fn chapter_order(a: &PlannedChapter, b: &PlannedChapter) -> std::cmp::Ordering {
    let key = |c: &PlannedChapter| {
        let d = &c.data;
        (
            d.number.is_none(),
            d.number.or(d.volume).unwrap_or(0.0),
            d.volume.unwrap_or(0.0),
        )
    };
    let (ka, kb) = (key(a), key(b));
    ka.0.cmp(&kb.0)
        .then(ka.1.total_cmp(&kb.1))
        .then(ka.2.total_cmp(&kb.2))
        .then_with(|| natural_cmp(&a.candidate.path, &b.candidate.path))
}

fn plan(
    discovered: Vec<SeriesCandidate>,
    known_chapters: &HashMap<String, KnownChapter>,
    known_series: &HashMap<String, KnownSeries>,
    mut read: HashMap<String, ChapterData>,
) -> Vec<PlannedSeries> {
    discovered
        .into_iter()
        .map(|series| {
            let known = known_series.get(&series.key);
            let mut chapters: Vec<PlannedChapter> = series
                .chapters
                .into_iter()
                .map(|candidate| {
                    let known_chapter = known_chapters.get(&candidate.path);
                    match read.remove(&candidate.path) {
                        Some(data) => PlannedChapter {
                            status: if known_chapter.is_some() {
                                Status::Updated
                            } else {
                                Status::Added
                            },
                            candidate,
                            data,
                        },
                        None => {
                            // Unchanged: read() skipped it, so it is known.
                            let known_chapter = known_chapter.cloned();
                            let (id, data) = known_chapter
                                .map(|k| (k.id, k.data))
                                .unwrap_or_else(|| (0, read_chapter(&candidate)));
                            PlannedChapter {
                                status: Status::Unchanged(id),
                                candidate,
                                data,
                            }
                        }
                    }
                })
                .collect();
            chapters.sort_by(chapter_order);

            // Series metadata from the first freshly read ComicInfo that has it.
            let infos: Vec<&ComicInfo> = chapters
                .iter()
                .filter_map(|c| c.data.info.as_ref())
                .collect();
            let info_title = infos.iter().find_map(|i| i.series.clone());
            let (title, title_from_info) = match (info_title, known) {
                (Some(title), _) => (title, true),
                (None, Some(known)) if known.title_from_info => (known.title.clone(), true),
                (None, _) => (series.title, false),
            };
            let meta = merged_meta(&infos);
            let changed = known.is_none()
                || chapters
                    .iter()
                    .any(|c| !matches!(c.status, Status::Unchanged(_)));
            PlannedSeries {
                candidate_key: series.key,
                path: series.path,
                title,
                title_from_info,
                meta,
                chapters,
                cover_hash: known.and_then(|k| k.cover_hash.clone()),
                cover_source: known.and_then(|k| k.cover_source.clone()),
                changed,
            }
        })
        .collect()
}

fn merged_meta(infos: &[&ComicInfo]) -> Option<ComicInfo> {
    if infos.is_empty() {
        return None;
    }
    let first = |f: fn(&ComicInfo) -> Option<String>| infos.iter().find_map(|i| f(i));
    Some(ComicInfo {
        summary: first(|i| i.summary.clone()),
        writer: first(|i| i.writer.clone()),
        language: first(|i| i.language.clone()),
        manga: first(|i| i.manga.clone()),
        year: infos.iter().find_map(|i| i.year),
        genres: infos
            .iter()
            .find(|i| !i.genres.is_empty())
            .map(|i| i.genres.clone())
            .unwrap_or_default(),
        ..ComicInfo::default()
    })
}

fn cover_jobs(
    planned: &[PlannedSeries],
    known_series: &HashMap<String, KnownSeries>,
    known_covers: &HashMap<String, String>,
    covers: &CoverCache,
) -> Vec<CoverJob> {
    planned
        .iter()
        .enumerate()
        .filter_map(|(index, series)| {
            let chapter = series
                .chapters
                .iter()
                .find(|c| c.data.error.is_none() && c.data.page_count > 0)?;
            let source = format!(
                "{}|{}|{}",
                chapter.candidate.path, chapter.candidate.mtime, chapter.data.cover_page
            );
            let known = known_series.get(&series.candidate_key);
            let up_to_date = known.is_some_and(|k| {
                k.cover_source.as_deref() == Some(source.as_str())
                    && match &k.cover_hash {
                        // A failed decode is remembered and not retried until
                        // the chapter changes.
                        None => true,
                        Some(hash) => known_covers
                            .get(hash)
                            .is_some_and(|file| covers.absolute(file).exists()),
                    }
            });
            (!up_to_date).then(|| CoverJob {
                series: index,
                path: chapter.candidate.path.clone(),
                page: usize::try_from(chapter.data.cover_page).unwrap_or(0),
                source,
            })
        })
        .collect()
}

fn make_cover(
    covers: &CoverCache,
    known_covers: &HashMap<String, String>,
    claimed: &Mutex<HashSet<String>>,
    job: &CoverJob,
) -> CoverOutcome {
    let options = OpenOptions {
        probe_dimensions: false,
        ..OpenOptions::default()
    };
    let Ok(source) = kirei_archive::open_with(Path::new(&job.path), &options) else {
        return CoverOutcome::Failed;
    };
    let Ok(bytes) = source.read_page(job.page) else {
        return CoverOutcome::Failed;
    };
    let hash = CoverCache::hash(&bytes);
    if known_covers
        .get(&hash)
        .is_some_and(|file| covers.absolute(file).exists())
    {
        return CoverOutcome::Known(hash);
    }
    let first_claim = claimed
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .insert(hash.clone());
    if !first_claim {
        return CoverOutcome::Known(hash);
    }
    match covers.make(&hash, &bytes) {
        Ok(cover) => CoverOutcome::Made(cover),
        Err(_) => CoverOutcome::Failed,
    }
}

// --- Database --------------------------------------------------------------

type Known = (
    HashMap<String, KnownChapter>,
    HashMap<String, KnownSeries>,
    HashMap<String, String>,
);

fn parse_kind(kind: &str) -> SourceKind {
    match kind {
        "rar" => SourceKind::Rar,
        "folder" => SourceKind::Folder,
        _ => SourceKind::Zip,
    }
}

pub(crate) fn kind_str(kind: SourceKind) -> &'static str {
    match kind {
        SourceKind::Zip => "zip",
        SourceKind::Rar => "rar",
        SourceKind::Folder => "folder",
    }
}

fn load_known(conn: &Connection, root_id: i64) -> Result<Known> {
    let mut chapters = HashMap::new();
    let mut stmt = conn.prepare_cached(
        "SELECT c.id, c.path, c.file_size, c.file_mtime, c.missing, c.error, c.kind, c.title,
                c.volume, c.number, c.page_count, c.cover_page, c.language, c.scan_group
         FROM chapters c JOIN series s ON s.id = c.series_id
         WHERE s.root_id = ?1",
    )?;
    let rows = stmt.query_map([root_id], |row| {
        let path: String = row.get(1)?;
        let kind: String = row.get(6)?;
        let error: Option<String> = row.get(5)?;
        Ok((
            path,
            KnownChapter {
                id: row.get(0)?,
                size: row.get(2)?,
                mtime: row.get(3)?,
                missing: row.get(4)?,
                error: error.clone(),
                data: ChapterData {
                    kind: parse_kind(&kind),
                    title: row.get(7)?,
                    volume: row.get(8)?,
                    number: row.get(9)?,
                    page_count: row.get(10)?,
                    cover_page: row.get(11)?,
                    language: row.get(12)?,
                    scan_group: row.get(13)?,
                    error,
                    info: None,
                },
            },
        ))
    })?;
    for row in rows {
        let (path, chapter) = row?;
        chapters.insert(path, chapter);
    }

    let mut series = HashMap::new();
    let mut stmt = conn.prepare_cached(
        "SELECT key, title, title_from_info, cover_hash, cover_source FROM series WHERE root_id = ?1",
    )?;
    let rows = stmt.query_map([root_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            KnownSeries {
                title: row.get(1)?,
                title_from_info: row.get(2)?,
                cover_hash: row.get(3)?,
                cover_source: row.get(4)?,
            },
        ))
    })?;
    for row in rows {
        let (key, known) = row?;
        series.insert(key, known);
    }

    let mut covers = HashMap::new();
    let mut stmt = conn.prepare_cached("SELECT hash, file FROM covers")?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    for row in rows {
        let (hash, file) = row?;
        covers.insert(hash, file);
    }
    Ok((chapters, series, covers))
}

fn write(
    conn: &mut Connection,
    root_id: i64,
    planned: &[PlannedSeries],
    known_chapters: &HashMap<String, KnownChapter>,
    new_covers: &[NewCover],
    summary: &mut ScanSummary,
) -> Result<()> {
    let now = now_ms();
    let tx = conn.transaction()?;
    {
        let mut insert_cover = tx.prepare_cached(
            "INSERT OR IGNORE INTO covers (hash, file, width, height, palette, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?;
        for cover in new_covers {
            insert_cover.execute(params![
                cover.hash,
                cover.file,
                cover.width,
                cover.height,
                serde_json::to_string(&cover.palette)?,
                now
            ])?;
        }

        let mut upsert_series = tx.prepare_cached(
            "INSERT INTO series (root_id, key, path, title, sort_title, title_from_info,
                 description, writer, year, language, genres, manga, cover_hash, cover_source,
                 missing, added_at, updated_at, ident)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15, ?15, ?17)
             ON CONFLICT (key) DO UPDATE SET
                 ident = excluded.ident,
                 root_id = excluded.root_id,
                 path = excluded.path,
                 title = excluded.title,
                 sort_title = excluded.sort_title,
                 title_from_info = excluded.title_from_info,
                 description = coalesce(excluded.description, series.description),
                 writer = coalesce(excluded.writer, series.writer),
                 year = coalesce(excluded.year, series.year),
                 language = coalesce(excluded.language, series.language),
                 genres = coalesce(excluded.genres, series.genres),
                 manga = coalesce(excluded.manga, series.manga),
                 cover_hash = excluded.cover_hash,
                 cover_source = excluded.cover_source,
                 missing = 0,
                 updated_at = CASE WHEN ?16 THEN excluded.updated_at ELSE series.updated_at END
             RETURNING id",
        )?;
        let mut upsert_chapter = tx.prepare_cached(
            "INSERT INTO chapters (series_id, path, kind, title, volume, number, sort_order,
                 page_count, cover_page, file_size, file_mtime, language, scan_group, missing,
                 error, added_at, updated_at, ident)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 0, ?14, ?15, ?15, ?16)
             ON CONFLICT (path) DO UPDATE SET
                 ident = excluded.ident,
                 series_id = excluded.series_id,
                 kind = excluded.kind,
                 title = excluded.title,
                 volume = excluded.volume,
                 number = excluded.number,
                 sort_order = excluded.sort_order,
                 page_count = excluded.page_count,
                 cover_page = excluded.cover_page,
                 file_size = excluded.file_size,
                 file_mtime = excluded.file_mtime,
                 language = excluded.language,
                 scan_group = excluded.scan_group,
                 missing = 0,
                 error = excluded.error,
                 updated_at = excluded.updated_at
             RETURNING id",
        )?;
        // Progress follows its chapter's current identity and file.
        let mut refresh_progress = tx.prepare_cached(
            "UPDATE reading_progress SET ident = ?2, file_size = ?3 WHERE chapter_id = ?1",
        )?;
        // An orphan with the same identity and file size comes back to life.
        let mut relink_progress = tx.prepare_cached(
            "UPDATE reading_progress SET chapter_id = ?1, orphaned_at = NULL
             WHERE id = (SELECT id FROM reading_progress
                         WHERE chapter_id IS NULL AND ident = ?2 AND file_size = ?3
                         ORDER BY updated_at DESC LIMIT 1)
               AND NOT EXISTS (SELECT 1 FROM reading_progress WHERE chapter_id = ?1)",
        )?;
        let mut relink_settings = tx.prepare_cached(
            "UPDATE series_settings SET series_id = ?1, orphaned_at = NULL
             WHERE id = (SELECT id FROM series_settings
                         WHERE series_id IS NULL AND ident = ?2
                         ORDER BY updated_at DESC LIMIT 1)
               AND NOT EXISTS (SELECT 1 FROM series_settings WHERE series_id = ?1)",
        )?;
        let orphan_progress: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM reading_progress WHERE chapter_id IS NULL)",
            [],
            |row| row.get(0),
        )?;
        let orphan_settings: bool = tx.query_row(
            "SELECT EXISTS (SELECT 1 FROM series_settings WHERE series_id IS NULL)",
            [],
            |row| row.get(0),
        )?;
        let mut touch_chapter = tx.prepare_cached(
            "UPDATE chapters SET series_id = ?1, sort_order = ?2, missing = 0 WHERE id = ?3",
        )?;

        let mut seen: HashSet<&str> = HashSet::new();
        for series in planned {
            let meta = series.meta.as_ref();
            let genres = meta
                .filter(|m| !m.genres.is_empty())
                .map(|m| m.genres.join(", "));
            let s_ident = series_ident(&series.candidate_key, &series.path);
            let series_id: i64 = upsert_series.query_row(
                params![
                    root_id,
                    series.candidate_key,
                    series.path,
                    series.title,
                    series.title.to_lowercase(),
                    series.title_from_info,
                    meta.and_then(|m| m.summary.clone()),
                    meta.and_then(|m| m.writer.clone()),
                    meta.and_then(|m| m.year),
                    meta.and_then(|m| m.language.clone()),
                    genres,
                    meta.and_then(|m| m.manga.clone()),
                    series.cover_hash,
                    series.cover_source,
                    now,
                    series.changed,
                    s_ident,
                ],
                |row| row.get(0),
            )?;
            if orphan_settings {
                relink_settings.execute(params![series_id, s_ident])?;
            }
            summary.series += 1;
            for (order, chapter) in series.chapters.iter().enumerate() {
                let order = i64::try_from(order).unwrap_or(i64::MAX);
                seen.insert(chapter.candidate.path.as_str());
                summary.chapters += 1;
                let c_ident = chapter_ident(&s_ident, &series.path, &chapter.candidate.path);
                match chapter.status {
                    Status::Unchanged(id) if id > 0 => {
                        touch_chapter.execute(params![series_id, order, id])?;
                        if orphan_progress {
                            relink_progress.execute(params![
                                id,
                                c_ident,
                                chapter.candidate.size
                            ])?;
                        }
                        summary.unchanged += 1;
                        continue;
                    }
                    Status::Added => summary.added += 1,
                    Status::Updated | Status::Unchanged(_) => summary.updated += 1,
                }
                let d = &chapter.data;
                if d.error.is_some() {
                    summary.errors += 1;
                }
                let chapter_id: i64 = upsert_chapter.query_row(
                    params![
                        series_id,
                        chapter.candidate.path,
                        kind_str(d.kind),
                        d.title,
                        d.volume,
                        d.number,
                        order,
                        d.page_count,
                        d.cover_page,
                        chapter.candidate.size,
                        chapter.candidate.mtime,
                        d.language,
                        d.scan_group,
                        d.error,
                        now,
                        c_ident,
                    ],
                    |row| row.get(0),
                )?;
                refresh_progress.execute(params![chapter_id, c_ident, chapter.candidate.size])?;
                if orphan_progress {
                    relink_progress.execute(params![
                        chapter_id,
                        c_ident,
                        chapter.candidate.size
                    ])?;
                }
            }
        }

        let mut mark_missing =
            tx.prepare_cached("UPDATE chapters SET missing = 1, updated_at = ?1 WHERE id = ?2")?;
        for (path, known) in known_chapters {
            if !known.missing && !seen.contains(path.as_str()) {
                mark_missing.execute(params![now, known.id])?;
            }
        }
    }
    // Series left with no chapter rows at all (regrouped elsewhere) go;
    // series whose chapters are all missing stay, flagged.
    tx.execute(
        "DELETE FROM series WHERE root_id = ?1
           AND NOT EXISTS (SELECT 1 FROM chapters WHERE series_id = series.id)",
        [root_id],
    )?;
    tx.execute(
        "UPDATE series SET missing = NOT EXISTS (
             SELECT 1 FROM chapters c WHERE c.series_id = series.id AND c.missing = 0)
         WHERE root_id = ?1",
        [root_id],
    )?;
    let missing: i64 = tx.query_row(
        "SELECT count(*) FROM chapters c JOIN series s ON s.id = c.series_id
         WHERE s.root_id = ?1 AND c.missing = 1",
        [root_id],
        |row| row.get(0),
    )?;
    summary.missing += usize::try_from(missing).unwrap_or(0);
    tx.execute(
        "UPDATE library_roots SET last_scan_at = ?1 WHERE id = ?2",
        params![now, root_id],
    )?;
    tx.commit()?;
    Ok(())
}

/// Looks up a root's path, for scans started by id.
pub(crate) fn root_path(conn: &Connection, root_id: i64) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT path FROM library_roots WHERE id = ?1",
            [root_id],
            |row| row.get(0),
        )
        .optional()?)
}
