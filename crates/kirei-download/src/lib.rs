//! Offline downloads: MangaDex chapters written into the local library as
//! CBZ archives with `ComicInfo.xml`.
//!
//! - [`Downloader`] runs a persistent queue ([`Store`], its own SQLite file)
//!   that survives a restart: jobs that were downloading go back to the queue
//!   and pick up from the pages already fetched.
//! - Pages land in a per chapter staging folder outside the library, each one
//!   written to a temporary name and renamed when complete.
//! - The archive is written to a hidden temporary file beside its final
//!   name, synced and renamed into place, so the library never sees half a
//!   CBZ, whenever the app is killed.
//! - Every request goes through the app's one MangaDex client
//!   ([`ChapterSource`]), so downloads share its rate limits, MangaDex@Home
//!   reports and server failover; the downloader adds its own budget for
//!   page images on top.
//!
//! Folder and file names follow the library scanner's rules (see
//! [`naming`]), so a downloaded series groups like any other folder.

mod cbz;
mod comic_info;
mod downloader;
mod error;
mod model;
pub mod naming;
mod source;
mod staging;
mod store;

pub use cbz::{temp_path, write_atomic};
pub use comic_info::comic_info_xml;
pub use downloader::{DownloadConfig, Downloader, Listener, PageRetry};
pub use error::{DownloadError, Result};
pub use model::{DownloadEvent, DownloadJob, JobState};
pub use source::ChapterSource;
pub use store::Store;

/// Re-exported so callers pick a quality and a page budget without depending
/// on the client crate directly.
pub use kirei_mangadex::{ImageQuality, RateWindow};

/// Current time as Unix milliseconds.
pub(crate) fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as i64)
        .unwrap_or(0)
}

/// MangaDex ids are UUIDs. Anything else is refused before it can become
/// part of a staging path.
pub(crate) fn valid_id(id: &str) -> bool {
    (1..=64).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}
