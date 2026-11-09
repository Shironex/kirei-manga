//! Shared domain types for KireiManga.
//!
//! Everything here is plain data: no I/O, no Tauri, no async. Every other crate
//! and the desktop shell depend on it, so it has to stay the cheapest crate in
//! the workspace to compile. The one exception is [`paths`], which checks for
//! the portable marker when it picks the data directory.

mod app;
mod page;
pub mod paths;
mod settings;

pub use app::AppInfo;
pub use page::{ImageFormat, PageInfo, SourceKind};
pub use paths::{DataMode, DataPaths};
pub use settings::{
    AppSettings, DownloadConcurrency, KeyBindings, MotionPreference, PageFit, ReaderMode,
    ReadingDirection, ResampleFilter, SettingError, ThemeStrength, TrackingConflict,
};
