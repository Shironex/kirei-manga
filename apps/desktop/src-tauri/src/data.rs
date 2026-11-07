//! Where the app's data lives, and backup and restore commands. See
//! `docs/data.md`.
//!
//! The data root is resolved once at launch through
//! [`kirei_core::DataPaths`]: a `data` folder beside the app in portable mode,
//! else the OS app data directory. Everything that writes to disk asks it.

use std::path::PathBuf;

use kirei_core::{DataMode, DataPaths, paths};
use kirei_library::{BackupManifest, BackupOptions, RestoreOutcome};
use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime};

use crate::catalog::Catalog;

/// Managed state: the resolved data paths (or why they could not be
/// resolved) and what the launch-time restore did, if anything ran.
pub(crate) struct DataState {
    paths: Result<DataPaths, String>,
    restore: Option<Result<RestoreOutcome, String>>,
}

impl DataState {
    /// Resolves the data root and swaps in a staged restore, if one waits.
    /// Must run before the library opens.
    pub(crate) fn init<R: Runtime>(app: &AppHandle<R>) -> Self {
        let paths = resolve(app);
        let restore = paths.as_ref().ok().and_then(|paths| {
            match kirei_library::apply_pending_restore(paths) {
                Ok(outcome) => outcome.map(Ok),
                Err(error) => {
                    eprintln!("KireiManga restore failed, previous data kept: {error}");
                    Some(Err(error.to_string()))
                }
            }
        });
        Self { paths, restore }
    }

    pub(crate) fn paths(&self) -> Result<&DataPaths, String> {
        self.paths.as_ref().map_err(Clone::clone)
    }
}

fn resolve<R: Runtime>(app: &AppHandle<R>) -> Result<DataPaths, String> {
    let exe = std::env::current_exe().map_err(|error| error.to_string())?;
    let paths = DataPaths::resolve(&exe, || {
        app.path().app_data_dir().map_err(|error| error.to_string())
    })?;
    std::fs::create_dir_all(paths.root())
        .map_err(|error| format!("cannot create {}: {error}", paths.root().display()))?;
    Ok(paths)
}

/// The window-state file to use in portable mode. Plugins are registered
/// before the app handle exists, so this checks the marker on its own;
/// `None` keeps the plugin's default, which is the installed data root.
pub(crate) fn portable_window_state() -> Option<String> {
    let exe = std::env::current_exe().ok()?;
    let root = paths::portable_root(&exe)?;
    let file = DataPaths::new(DataMode::Portable, root).window_state();
    file.to_str().map(str::to_owned)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DataInfo {
    mode: DataMode,
    root: PathBuf,
    database: PathBuf,
    covers: PathBuf,
    backups: PathBuf,
    /// What the restore at this launch did, when one ran.
    last_restore: Option<RestoreOutcome>,
    /// Why the restore at this launch failed (the previous data was kept).
    restore_error: Option<String>,
}

/// Where the data lives and whether this launch finished a restore.
#[tauri::command]
pub(crate) async fn data_info<R: Runtime>(app: AppHandle<R>) -> Result<DataInfo, String> {
    let state = app.state::<DataState>();
    let paths = state.paths()?;
    let (last_restore, restore_error) = match &state.restore {
        Some(Ok(outcome)) => (Some(outcome.clone()), None),
        Some(Err(error)) => (None, Some(error.clone())),
        None => (None, None),
    };
    Ok(DataInfo {
        mode: paths.mode(),
        root: paths.root().to_path_buf(),
        database: paths.database(),
        covers: paths.covers(),
        backups: paths.backups(),
        last_restore,
        restore_error,
    })
}

/// Writes a backup to `path` (the UI picks it with a save dialog). Covers are
/// packed only when `include_covers` is true.
#[tauri::command]
pub(crate) async fn backup_create<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    include_covers: bool,
) -> Result<BackupManifest, String> {
    let library = app.state::<Catalog>().library()?;
    let options = BackupOptions {
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        include_covers,
    };
    tauri::async_runtime::spawn_blocking(move || {
        library
            .create_backup(&PathBuf::from(path), &options)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Dry run of a restore: validates the backup at `path` fully (manifest,
/// schema, database hash and integrity) and returns its manifest. Changes
/// nothing.
#[tauri::command]
pub(crate) async fn backup_inspect<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<BackupManifest, String> {
    let scratch = app
        .state::<DataState>()
        .paths()?
        .restore_staging()
        .with_extension("inspect");
    tauri::async_runtime::spawn_blocking(move || {
        kirei_library::inspect_backup(&PathBuf::from(path), &scratch)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Validates the backup at `path` and stages it. The swap happens at the next
/// launch, so the UI should offer a restart (`app_restart`) after this.
#[tauri::command]
pub(crate) async fn backup_restore<R: Runtime>(
    app: AppHandle<R>,
    path: String,
) -> Result<BackupManifest, String> {
    let paths = app.state::<DataState>().paths()?.clone();
    tauri::async_runtime::spawn_blocking(move || {
        kirei_library::stage_restore(&PathBuf::from(path), &paths)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Restarts the app, which finishes a staged restore.
#[tauri::command]
pub(crate) fn app_restart<R: Runtime>(app: AppHandle<R>) {
    app.restart();
}
