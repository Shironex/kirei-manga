//! Shared domain types for KireiManga.
//!
//! Everything here is plain data: no I/O, no Tauri, no async. Every other crate
//! and the desktop shell depend on it, so it has to stay the cheapest crate in
//! the workspace to compile.

mod app;
mod page;

pub use app::AppInfo;
pub use page::{ImageFormat, PageInfo, SourceKind};
