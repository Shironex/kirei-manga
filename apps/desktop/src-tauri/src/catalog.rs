//! Library commands: roots, scanning with progress events, series, progress
//! and per-series settings. Thin wrappers over `kirei_library`; every call
//! runs on the blocking pool so SQLite and archive reads never touch the main
//! thread.

use std::path::PathBuf;
use std::sync::Arc;

use kirei_core::DataPaths;
use kirei_library::{
    Library, LibraryRoot, LibraryWatcher, ReadingProgress, ScanProgress, ScanSummary, SeriesDetail,
    SeriesSummary, WatchConfig,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// Event carrying a [`ScanProgress`] while a scan runs.
pub(crate) const SCAN_PROGRESS_EVENT: &str = "library:scan-progress";

/// Managed state. Holds the reason instead of the library when the database
/// could not be opened (a newer schema, a locked or unreadable file), so the
/// reader keeps working and the library commands report why.
pub(crate) struct Catalog(Result<Arc<Library>, String>);

impl Catalog {
    /// Opens the library in the resolved data root (see `data.rs`).
    pub(crate) fn open(paths: Result<&DataPaths, String>) -> Self {
        let opened = paths.and_then(|paths| {
            Library::open(&paths.database(), &paths.covers()).map_err(|error| error.to_string())
        });
        if let Err(error) = &opened {
            eprintln!("KireiManga library unavailable: {error}");
        }
        Self(opened.map(Arc::new))
    }

    #[cfg(test)]
    pub(crate) fn from_library(library: Library) -> Self {
        Self(Ok(Arc::new(library)))
    }

    pub(crate) fn library(&self) -> Result<Arc<Library>, String> {
        self.0.clone()
    }
}

/// Managed state: the watcher over every library root (see `docs/library.md`,
/// Watching). `None` when the library is unavailable.
pub(crate) struct Watch(Option<LibraryWatcher>);

impl Watch {
    /// Starts watching the roots, which first catches up on changes made
    /// while the app was closed (in the background, on the watcher thread).
    /// Rescans it starts report through the same `library:scan-progress`
    /// event as a manual scan.
    pub(crate) fn start<R: Runtime>(app: &AppHandle<R>, catalog: &Catalog) -> Self {
        let emitter = app.clone();
        Self(catalog.library().ok().map(|library| {
            LibraryWatcher::start(
                library,
                WatchConfig::default(),
                Arc::new(move |progress: ScanProgress| {
                    let _ = emitter.emit(SCAN_PROGRESS_EVENT, progress);
                }),
            )
        }))
    }

    /// Picks up added and removed roots.
    pub(crate) fn sync(&self) {
        if let Some(watcher) = &self.0 {
            watcher.sync();
        }
    }
}

/// Runs `work` against the library on the blocking pool.
pub(crate) async fn with_library<R, T, F>(app: &AppHandle<R>, work: F) -> Result<T, String>
where
    R: Runtime,
    T: Send + 'static,
    F: FnOnce(&Library) -> kirei_library::Result<T> + Send + 'static,
{
    let library = app.state::<Catalog>().library()?;
    tauri::async_runtime::spawn_blocking(move || work(&library).map_err(|e| e.to_string()))
        .await
        .map_err(|error| error.to_string())?
}

#[tauri::command]
pub(crate) async fn library_roots<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<LibraryRoot>, String> {
    with_library(&app, Library::roots).await
}

/// Adds a folder to the library and starts watching it. Does not scan; call
/// `library_scan` next.
#[tauri::command]
pub(crate) async fn library_add_root<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<LibraryRoot, String> {
    let root = with_library(&app, move |library| library.add_root(&PathBuf::from(path))).await?;
    app.state::<Watch>().sync();
    Ok(root)
}

/// Forgets a folder and its rows, and stops watching it. Files on disk are
/// never touched.
#[tauri::command]
pub(crate) async fn library_remove_root<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> Result<bool, String> {
    let removed = with_library(&app, move |library| library.remove_root(id)).await?;
    app.state::<Watch>().sync();
    Ok(removed)
}

/// Scans one root, or all of them when `root_id` is null, emitting
/// `library:scan-progress` events as it goes. Fails fast if a scan is
/// already running.
#[tauri::command]
pub(crate) async fn library_scan<R: Runtime>(
    app: AppHandle<R>,
    root_id: Option<i64>,
) -> Result<ScanSummary, String> {
    let emitter = app.clone();
    with_library(&app, move |library| {
        library.scan(root_id, &|progress: ScanProgress| {
            // A closed window just misses the event; the scan carries on.
            let _ = emitter.emit(SCAN_PROGRESS_EVENT, progress);
        })
    })
    .await
}

#[tauri::command]
pub(crate) async fn library_series<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<SeriesSummary>, String> {
    with_library(&app, Library::series).await
}

#[tauri::command]
pub(crate) async fn library_series_detail<R: Runtime>(
    app: AppHandle<R>,
    id: i64,
) -> Result<Option<SeriesDetail>, String> {
    with_library(&app, move |library| library.series_detail(id)).await
}

/// Records the page on screen (0 based). The last page completes the chapter.
#[tauri::command]
pub(crate) async fn library_record_progress<R: Runtime>(
    app: AppHandle<R>,
    chapter_id: i64,
    page: i64,
) -> Result<ReadingProgress, String> {
    with_library(&app, move |library| {
        library.record_progress(chapter_id, page)
    })
    .await
}

#[tauri::command]
pub(crate) async fn library_series_settings<R: Runtime>(
    app: AppHandle<R>,
    series_id: i64,
) -> Result<Option<serde_json::Value>, String> {
    with_library(&app, move |library| library.series_settings(series_id)).await
}

#[tauri::command]
pub(crate) async fn library_set_series_settings<R: Runtime>(
    app: AppHandle<R>,
    series_id: i64,
    settings: serde_json::Value,
) -> Result<(), String> {
    with_library(&app, move |library| {
        library.set_series_settings(series_id, &settings)
    })
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unavailable_library_reports_its_reason() {
        let catalog = Catalog(Err("schema 9 is newer".to_owned()));
        assert_eq!(
            catalog.library().err().as_deref(),
            Some("schema 9 is newer")
        );
    }

    #[test]
    fn the_library_opens_in_the_data_root() {
        let dir = tempfile::tempdir().unwrap();
        let paths = DataPaths::new(kirei_core::DataMode::Portable, dir.path().join("data"));
        let catalog = Catalog::open(Ok(&paths));
        assert!(catalog.library().is_ok());
        assert!(paths.database().is_file());
        assert!(paths.covers().is_dir());
    }

    #[test]
    fn an_open_library_is_shared() {
        let dir = tempfile::tempdir().unwrap();
        let catalog = Catalog::from_library(Library::open_in_memory(dir.path()).unwrap());
        let library = catalog.library().unwrap();
        assert!(library.roots().unwrap().is_empty());
    }
}
