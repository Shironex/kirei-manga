//! Download commands: the queue (`kirei_download::Downloader`) over the
//! shared MangaDex client, its progress events, and the downloads folder,
//! which is kept registered as a library root so finished chapters show up
//! through the library watcher like any other file. See `docs/downloads.md`.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use kirei_core::{AppSettings, DataPaths};
use kirei_download::{
    DownloadConfig, DownloadEvent, DownloadJob, Downloader, ImageQuality, Listener, Store,
};
use kirei_library::{Library, ScanProgress};
use kirei_mangadex::MangaDex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::catalog::{Catalog, SCAN_PROGRESS_EVENT, Watch};
use crate::mangadex_client;

/// Event carrying a [`DownloadEvent`] after every queue change.
pub(crate) const DOWNLOADS_EVENT: &str = "downloads:changed";

/// Where downloads go and whether the library sees them.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadFolder {
    pub(crate) path: String,
    /// The folder is a library root or sits inside one.
    pub(crate) in_library: bool,
    /// Why it could not be added to the library, when it could not.
    pub(crate) error: Option<String>,
}

/// Managed state. Holds the reason instead of the downloader when the queue
/// could not start (no data folder, a queue file from a newer build).
pub(crate) struct Downloads {
    downloader: Result<Downloader<MangaDex>, String>,
    folder: Mutex<DownloadFolder>,
}

/// The folder downloads go to: the setting, else `downloads/` in the data
/// folder (which follows portable mode).
pub(crate) fn resolve_folder(settings: &AppSettings, paths: &DataPaths) -> PathBuf {
    settings
        .downloads_folder
        .as_deref()
        .map(PathBuf::from)
        .unwrap_or_else(|| paths.downloads())
}

/// Makes sure `folder` exists and the library scans it: nothing to do when
/// it is a root or inside one, else it is added as a root of its own.
/// Returns the new root's id when one was added.
pub(crate) fn ensure_in_library(
    library: Option<&Library>,
    folder: &Path,
) -> (DownloadFolder, Option<i64>) {
    let mut status = DownloadFolder {
        path: folder.to_string_lossy().into_owned(),
        in_library: false,
        error: None,
    };
    if let Err(error) = std::fs::create_dir_all(folder) {
        status.error = Some(format!("cannot create the folder: {error}"));
        return (status, None);
    }
    let Some(library) = library else {
        status.error = Some("the library is unavailable".into());
        return (status, None);
    };
    let canonical = folder
        .canonicalize()
        .unwrap_or_else(|_| folder.to_path_buf());
    let roots = match library.roots() {
        Ok(roots) => roots,
        Err(error) => {
            status.error = Some(error.to_string());
            return (status, None);
        }
    };
    let covered = roots.iter().any(|root| {
        let root = Path::new(&root.path);
        let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
        canonical.starts_with(root)
    });
    if covered {
        status.in_library = true;
        return (status, None);
    }
    match library.add_root(folder) {
        Ok(root) => {
            status.in_library = true;
            (status, Some(root.id))
        }
        Err(error) => {
            status.error = Some(error.to_string());
            (status, None)
        }
    }
}

fn quality(settings: &AppSettings) -> ImageQuality {
    if settings.downloads_data_saver {
        ImageQuality::DataSaver
    } else {
        ImageQuality::Data
    }
}

impl Downloads {
    /// Opens the queue and starts downloading whatever was left. Runs once
    /// in `setup`, after the library and its watcher.
    pub(crate) fn start<R: Runtime>(app: &AppHandle<R>, paths: Result<&DataPaths, String>) -> Self {
        let catalog = app.state::<Catalog>();
        let library = catalog.library().ok();
        let settings = library
            .as_ref()
            .and_then(|library| library.settings().ok())
            .unwrap_or_default();
        let paths = match paths {
            Ok(paths) => paths.clone(),
            Err(error) => return Self::unavailable(error),
        };
        let folder = resolve_folder(&settings, &paths);
        let (status, added) = ensure_in_library(library.as_deref(), &folder);
        if let Some(root) = added {
            after_root_added(app, root);
        }

        let emitter = app.clone();
        let listener: Listener = Arc::new(move |event: &DownloadEvent| {
            // A closed window just misses the event.
            let _ = emitter.emit(DOWNLOADS_EVENT, event);
        });
        let started = Store::open(&paths.download_queue())
            .map_err(|error| error.to_string())
            .and_then(|store| {
                let client = mangadex_client::shared(app)?;
                let mut config = DownloadConfig::new(folder, paths.download_staging());
                config.concurrency = usize::from(settings.downloads_concurrency.get());
                // The dispatcher is a tokio task, so it is spawned on Tauri's
                // runtime.
                let runtime = tauri::async_runtime::handle();
                let _entered = runtime.inner().enter();
                Ok(Downloader::start(client, store, config, Some(listener)))
            });
        if let Err(error) = &started {
            eprintln!("KireiManga downloads unavailable: {error}");
        }
        Self {
            downloader: started,
            folder: Mutex::new(status),
        }
    }

    fn unavailable(error: String) -> Self {
        Self {
            downloader: Err(error),
            folder: Mutex::new(DownloadFolder {
                path: String::new(),
                in_library: false,
                error: None,
            }),
        }
    }

    fn downloader(&self) -> Result<&Downloader<MangaDex>, String> {
        self.downloader.as_ref().map_err(Clone::clone)
    }

    fn folder(&self) -> DownloadFolder {
        self.folder
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

/// A root was added for the downloads folder: watch it and scan it once, in
/// case the folder already held chapters.
fn after_root_added<R: Runtime>(app: &AppHandle<R>, root: i64) {
    if let Some(watch) = app.try_state::<Watch>() {
        watch.sync();
    }
    let Ok(library) = app.state::<Catalog>().library() else {
        return;
    };
    let emitter = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _ = library.scan(Some(root), &|progress: ScanProgress| {
            let _ = emitter.emit(SCAN_PROGRESS_EVENT, progress);
        });
    });
}

/// Applies changed download settings: chapters at a time and the folder.
/// Called by `settings_set`.
pub(crate) fn apply_settings<R: Runtime>(app: &AppHandle<R>, settings: &AppSettings) {
    let Some(downloads) = app.try_state::<Downloads>() else {
        return;
    };
    let Ok(downloader) = downloads.downloader() else {
        return;
    };
    downloader.set_concurrency(usize::from(settings.downloads_concurrency.get()));
    let Some(data) = app.try_state::<crate::data::DataState>() else {
        return;
    };
    let Ok(paths) = data.paths() else {
        return;
    };
    let folder = resolve_folder(settings, paths);
    if folder == downloader.destination() {
        return;
    }
    let library = app.state::<Catalog>().library().ok();
    let (status, added) = ensure_in_library(library.as_deref(), &folder);
    downloader.set_destination(folder);
    *downloads
        .folder
        .lock()
        .unwrap_or_else(PoisonError::into_inner) = status;
    if let Some(root) = added {
        after_root_added(app, root);
    }
}

fn settings<R: Runtime>(app: &AppHandle<R>) -> AppSettings {
    app.state::<Catalog>()
        .library()
        .ok()
        .and_then(|library| library.settings().ok())
        .unwrap_or_default()
}

/// Queues chapters by MangaDex id with the data saver setting in effect.
/// Chapters already queued or downloaded are skipped.
pub(crate) fn request_download<R: Runtime>(
    app: &AppHandle<R>,
    chapter_ids: &[String],
    auto: bool,
) -> Result<Vec<DownloadJob>, String> {
    let quality = quality(&settings(app));
    app.state::<Downloads>()
        .downloader()?
        .enqueue(chapter_ids, quality, auto)
        .map_err(|error| error.to_string())
}

/// New chapters of followed series, from the follow feed (#43). Queued only
/// when `downloads.autoFollows` is on; returns what was queued.
pub(crate) fn auto_download_new<R: Runtime>(
    app: &AppHandle<R>,
    chapter_ids: &[String],
) -> Result<Vec<DownloadJob>, String> {
    if !settings(app).downloads_auto_follows {
        return Ok(Vec::new());
    }
    request_download(app, chapter_ids, true)
}

#[tauri::command]
pub(crate) async fn downloads_list<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<DownloadJob>, String> {
    app.state::<Downloads>()
        .downloader()?
        .jobs()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn downloads_enqueue<R: Runtime>(
    app: AppHandle<R>,
    chapter_ids: Vec<String>,
) -> Result<Vec<DownloadJob>, String> {
    request_download(&app, &chapter_ids, false)
}

#[tauri::command]
pub(crate) async fn downloads_auto<R: Runtime>(
    app: AppHandle<R>,
    chapter_ids: Vec<String>,
) -> Result<Vec<DownloadJob>, String> {
    auto_download_new(&app, &chapter_ids)
}

/// Pauses jobs by id, or every job when `ids` is null.
#[tauri::command]
pub(crate) async fn downloads_pause<R: Runtime>(
    app: AppHandle<R>,
    ids: Option<Vec<i64>>,
) -> Result<(), String> {
    app.state::<Downloads>()
        .downloader()?
        .pause(ids.as_deref())
        .map_err(|error| error.to_string())
}

/// Resumes paused and failed jobs by id, or all of them when `ids` is null.
#[tauri::command]
pub(crate) async fn downloads_resume<R: Runtime>(
    app: AppHandle<R>,
    ids: Option<Vec<i64>>,
) -> Result<(), String> {
    app.state::<Downloads>()
        .downloader()?
        .resume(ids.as_deref())
        .map_err(|error| error.to_string())
}

/// Cancels jobs by id (every job when null), deleting their staged pages.
#[tauri::command]
pub(crate) async fn downloads_cancel<R: Runtime>(
    app: AppHandle<R>,
    ids: Option<Vec<i64>>,
) -> Result<(), String> {
    app.state::<Downloads>()
        .downloader()?
        .cancel(ids.as_deref())
        .map_err(|error| error.to_string())
}

/// Removes finished jobs from the list; their archives stay.
#[tauri::command]
pub(crate) async fn downloads_clear_finished<R: Runtime>(
    app: AppHandle<R>,
) -> Result<usize, String> {
    app.state::<Downloads>()
        .downloader()?
        .clear_finished()
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) async fn downloads_folder<R: Runtime>(
    app: AppHandle<R>,
) -> Result<DownloadFolder, String> {
    Ok(app.state::<Downloads>().folder())
}

/// Shows the downloads folder in Finder or Explorer.
#[tauri::command]
pub(crate) async fn open_downloads_folder<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let folder = app.state::<Downloads>().folder();
    if folder.path.is_empty() {
        return Err("downloads are unavailable".into());
    }
    std::fs::create_dir_all(&folder.path).map_err(|error| error.to_string())?;
    crate::settings::spawn_open(PathBuf::from(folder.path).into_os_string()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use kirei_core::DataMode;

    #[test]
    fn the_default_folder_follows_the_data_folder() {
        let paths = DataPaths::new(DataMode::Portable, "/x/data");
        let settings = AppSettings::default();
        assert_eq!(
            resolve_folder(&settings, &paths),
            Path::new("/x/data/downloads")
        );
        let moved = AppSettings {
            downloads_folder: Some("/elsewhere/manga".into()),
            ..AppSettings::default()
        };
        assert_eq!(
            resolve_folder(&moved, &paths),
            Path::new("/elsewhere/manga")
        );
    }

    #[test]
    fn a_new_folder_becomes_a_root_and_a_nested_one_does_not() {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(&dir.path().join("covers")).unwrap();
        let downloads = dir.path().join("downloads");
        let (status, added) = ensure_in_library(Some(&library), &downloads);
        assert!(status.in_library, "{status:?}");
        assert!(added.is_some());
        assert!(downloads.is_dir());

        // A folder inside an existing root is already scanned.
        let inner = downloads.join("inner");
        let (status, added) = ensure_in_library(Some(&library), &inner);
        assert!(status.in_library);
        assert_eq!(added, None);
        assert_eq!(library.roots().unwrap().len(), 1);

        // A folder around an existing root cannot be added: roots may not nest.
        let (status, added) = ensure_in_library(Some(&library), dir.path());
        assert!(!status.in_library);
        assert!(status.error.is_some());
        assert_eq!(added, None);
    }

    #[test]
    fn without_a_library_the_folder_is_still_made() {
        let dir = tempfile::tempdir().unwrap();
        let folder = dir.path().join("d");
        let (status, added) = ensure_in_library(None, &folder);
        assert!(folder.is_dir());
        assert!(!status.in_library);
        assert_eq!(added, None);
    }
}
