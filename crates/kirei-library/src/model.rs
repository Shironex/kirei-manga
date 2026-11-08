//! Plain data the library hands to the shell. Serialized in camelCase for the
//! webview.

use kirei_core::SourceKind;
use serde::Serialize;

use crate::palette::Palette;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryRoot {
    pub id: i64,
    pub path: String,
    pub added_at: i64,
    pub last_scan_at: Option<i64>,
    pub series_count: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverRef {
    /// Hash of the source image and the cover rule; also the cache key.
    pub hash: String,
    /// Absolute path of the thumbnail in the app data dir.
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub palette: Palette,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesSummary {
    pub id: i64,
    pub root_id: i64,
    pub title: String,
    pub path: String,
    pub cover: Option<CoverRef>,
    /// Chapters present on disk.
    pub chapter_count: i64,
    /// Chapters whose files are gone since the last scan (rows are kept so
    /// progress survives a drive being unplugged).
    pub missing_count: i64,
    pub completed_count: i64,
    /// When any chapter of the series was last read.
    pub last_read_at: Option<i64>,
    /// Unread chapters that appeared after the series was last read; always
    /// 0 for a series never opened (everything there is simply unread).
    pub new_count: i64,
    /// The chapter "continue" opens: the last one read if unfinished, else the
    /// next unfinished one, else the first.
    pub continue_chapter_id: Option<i64>,
    /// Every chapter of the series is missing.
    pub missing: bool,
    pub added_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub chapter_id: i64,
    /// 0 based page index.
    pub page: i64,
    pub page_count: i64,
    pub completed: bool,
    pub updated_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterEntry {
    pub id: i64,
    pub path: String,
    pub kind: SourceKind,
    pub title: Option<String>,
    pub volume: Option<f64>,
    pub number: Option<f64>,
    pub page_count: i64,
    pub language: Option<String>,
    pub scan_group: Option<String>,
    pub missing: bool,
    /// Why the last open failed, when it did. The chapter stays listed.
    pub error: Option<String>,
    pub progress: Option<ReadingProgress>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesDetail {
    #[serde(flatten)]
    pub summary: SeriesSummary,
    pub description: Option<String>,
    pub writer: Option<String>,
    pub year: Option<i64>,
    pub language: Option<String>,
    pub genres: Vec<String>,
    /// ComicInfo `<Manga>`: `YesAndRightToLeft` means read right to left.
    pub manga: Option<String>,
    pub chapters: Vec<ChapterEntry>,
}

/// Where a scan is.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScanPhase {
    /// Walking the folders.
    Discovering,
    /// Opening new or changed archives.
    Reading,
    /// Making cover thumbnails.
    Covers,
    /// Writing to the database.
    Saving,
    Done,
}

/// One progress report. Reports are throttled, but the first and last of
/// each phase always arrive.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: ScanPhase,
    pub root: String,
    pub done: usize,
    pub total: usize,
    pub current: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub roots: usize,
    pub series: usize,
    pub chapters: usize,
    pub added: usize,
    pub updated: usize,
    pub unchanged: usize,
    pub missing: usize,
    /// Chapters that failed to open (kept, with the error stored).
    pub errors: usize,
    pub covers_made: usize,
    /// Roots that could not be read at all, with the reason.
    pub root_errors: Vec<String>,
    pub elapsed_ms: f64,
}

/// Size of the cover thumbnail cache on disk.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverCacheUsage {
    pub bytes: u64,
    pub files: u64,
}

/// What [`crate::Library::purge_orphans`] deleted.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OrphanPurge {
    pub progress: usize,
    pub settings: usize,
}
