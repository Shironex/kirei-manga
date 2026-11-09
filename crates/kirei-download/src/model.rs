//! What the queue reports: one row per chapter, serialized in camelCase for
//! the renderer.

use kirei_mangadex::ImageQuality;
use serde::{Deserialize, Serialize};

/// Where a job is in its life.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum JobState {
    /// Waiting for a free slot.
    Queued,
    /// Fetching pages or writing the archive.
    Downloading,
    /// Held by the user; finished pages are kept.
    Paused,
    /// The archive is in the library.
    Done,
    /// Stopped by an error; finished pages are kept and resume retries.
    Failed,
}

impl JobState {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Queued => "queued",
            Self::Downloading => "downloading",
            Self::Paused => "paused",
            Self::Done => "done",
            Self::Failed => "failed",
        }
    }

    pub(crate) fn parse(text: &str) -> Self {
        match text {
            "downloading" => Self::Downloading,
            "paused" => Self::Paused,
            "done" => Self::Done,
            "failed" => Self::Failed,
            _ => Self::Queued,
        }
    }
}

pub(crate) fn quality_str(quality: ImageQuality) -> &'static str {
    match quality {
        ImageQuality::Data => "data",
        ImageQuality::DataSaver => "dataSaver",
    }
}

pub(crate) fn parse_quality(text: &str) -> ImageQuality {
    match text {
        "dataSaver" => ImageQuality::DataSaver,
        _ => ImageQuality::Data,
    }
}

/// One chapter in the queue.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    pub id: i64,
    pub chapter_id: String,
    /// Filled once the chapter's details have been fetched.
    pub manga_id: Option<String>,
    pub series_title: Option<String>,
    /// `Vol. 2 Ch. 11 · Title`, for the queue list.
    pub chapter_label: Option<String>,
    pub language: Option<String>,
    pub quality: ImageQuality,
    pub state: JobState,
    pub pages_done: u32,
    /// Known once the image server has listed the pages.
    pub pages_total: Option<u32>,
    pub error: Option<String>,
    /// Where the archive goes (or went), once known.
    pub path: Option<String>,
    /// Queued by the follow feed rather than by hand.
    pub auto: bool,
    pub added_at: i64,
    pub updated_at: i64,
}

/// Sent to the listener after every change.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum DownloadEvent {
    /// A job was added or changed; carries its new state.
    Changed { job: DownloadJob },
    /// A job was cancelled or cleared from the list.
    Removed { id: i64 },
}
