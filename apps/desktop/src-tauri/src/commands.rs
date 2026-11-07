use std::path::PathBuf;
use std::time::Instant;

use kirei_core::{AppInfo, PageInfo, SourceKind};
use kirei_reader::{Direction, ReaderStats};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use crate::library::Library;

/// Identity of the running build. Async so it never runs on the main thread,
/// which keeps the convention every later command follows.
#[tauri::command]
pub(crate) async fn app_info() -> AppInfo {
    AppInfo::current(env!("CARGO_PKG_VERSION"))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenedSource {
    id: u64,
    kind: SourceKind,
    pages: Vec<PageInfo>,
    /// Wall time of the open, including the header probe, in milliseconds.
    open_ms: f64,
}

/// Opens a CBZ/ZIP, CBR/RAR or image folder picked by the user.
#[tauri::command]
pub(crate) async fn open_source<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<OpenedSource, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let library = app.state::<Library>();
        let start = Instant::now();
        let (id, source) = library
            .open(&PathBuf::from(path))
            .map_err(|error| error.to_string())?;
        Ok(OpenedSource {
            id,
            kind: source.kind(),
            pages: source.pages().to_vec(),
            open_ms: start.elapsed().as_secs_f64() * 1000.0,
        })
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ReadDirection {
    Forward,
    Backward,
}

/// Tells the reader which page is on screen so it reads the next ones ahead.
#[tauri::command]
pub(crate) async fn focus_page<R: Runtime>(
    app: AppHandle<R>,
    id: u64,
    index: usize,
    direction: ReadDirection,
) -> Result<(), String> {
    let direction = match direction {
        ReadDirection::Forward => Direction::Forward,
        ReadDirection::Backward => Direction::Backward,
    };
    if app.state::<Library>().focus(id, index, direction) {
        Ok(())
    } else {
        Err(format!("unknown source {id}"))
    }
}

#[tauri::command]
pub(crate) async fn close_source<R: Runtime>(app: AppHandle<R>, id: u64) {
    app.state::<Library>().close(id);
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CacheStats {
    hits: u64,
    misses: u64,
    prefetched: u64,
    dropped_stale: u64,
    errors: u64,
    cached_pages: usize,
    cached_bytes: usize,
    budget_bytes: usize,
}

/// Cache and read-ahead counters, for the test page and later the debug panel.
#[tauri::command]
pub(crate) async fn reader_stats<R: Runtime>(app: AppHandle<R>) -> CacheStats {
    let library = app.state::<Library>();
    let reader = library.reader();
    let ReaderStats {
        hits,
        misses,
        prefetched,
        dropped_stale,
        errors,
    } = reader.stats();
    CacheStats {
        hits,
        misses,
        prefetched,
        dropped_stale,
        errors,
        cached_pages: reader.cache().len(),
        cached_bytes: reader.cache().bytes_used(),
        budget_bytes: reader.cache().budget(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_reports_the_crate_version() {
        let info = tauri::async_runtime::block_on(app_info());
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
    }

    #[test]
    fn directions_deserialize_from_camel_case() {
        let forward: ReadDirection = serde_json::from_str("\"forward\"").unwrap();
        assert!(matches!(forward, ReadDirection::Forward));
        let backward: ReadDirection = serde_json::from_str("\"backward\"").unwrap();
        assert!(matches!(backward, ReadDirection::Backward));
    }
}
