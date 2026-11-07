//! Settings screen commands: the app settings store with a change event,
//! library housekeeping (hidden progress, cover cache), the data folder, a
//! fixed set of external links and the bundled third party notices.

use std::path::{Path, PathBuf};
use std::process::Command;

use kirei_core::AppSettings;
use kirei_library::{CoverCacheUsage, Library, OrphanPurge};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::catalog::with_library;

/// Event carrying the full [`AppSettings`] after any change, sent to every
/// window so open views apply it live.
pub(crate) const SETTINGS_CHANGED_EVENT: &str = "settings:changed";

/// Bundled next to the app as a resource (see `tauri.conf.json`).
const NOTICES_RESOURCE: &str = "THIRD_PARTY_NOTICES";

#[tauri::command]
pub(crate) async fn settings_get<R: Runtime>(app: AppHandle<R>) -> Result<AppSettings, String> {
    with_library(&app, Library::settings).await
}

/// Validates and stores one setting, then broadcasts the settings now in
/// effect. Refuses unknown keys and values of the wrong type with a message.
#[tauri::command]
pub(crate) async fn settings_set<R: Runtime>(
    app: AppHandle<R>,
    key: String,
    value: serde_json::Value,
) -> Result<AppSettings, String> {
    let settings = with_library(&app, move |library| library.set_setting(&key, value)).await?;
    // A window that is closing just misses the event.
    let _ = app.emit(SETTINGS_CHANGED_EVENT, &settings);
    Ok(settings)
}

/// Deletes reading progress and series settings left hidden by removed
/// folders, orphaned for at least `older_than_days` (all of them when null).
#[tauri::command]
pub(crate) async fn library_purge_orphans<R: Runtime>(
    app: AppHandle<R>,
    older_than_days: Option<u32>,
) -> Result<OrphanPurge, String> {
    with_library(&app, move |library| {
        library.purge_orphans(older_than_days.unwrap_or(0))
    })
    .await
}

#[tauri::command]
pub(crate) async fn library_cover_cache<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CoverCacheUsage, String> {
    with_library(&app, Library::cover_cache_usage).await
}

/// Deletes the cover thumbnails; the next scan makes them again.
#[tauri::command]
pub(crate) async fn library_clear_cover_cache<R: Runtime>(
    app: AppHandle<R>,
) -> Result<CoverCacheUsage, String> {
    with_library(&app, Library::clear_cover_cache).await
}

/// Folder holding the library database, settings and cover cache.
#[tauri::command]
pub(crate) async fn data_dir<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    Ok(app_data_dir(&app)?.to_string_lossy().into_owned())
}

/// Shows the data folder in Finder or Explorer.
#[tauri::command]
pub(crate) async fn open_data_dir<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let dir = app_data_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    spawn_open(dir.into_os_string()).await
}

/// The only places the app opens in the browser. A fixed set instead of a
/// URL argument, so the renderer cannot be used to launch arbitrary targets.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum Link {
    Website,
    Repository,
    Issues,
    Notices,
}

impl Link {
    fn url(self) -> &'static str {
        match self {
            Self::Website => "https://kireimanga.app",
            Self::Repository => "https://github.com/Shironex/kirei-manga",
            Self::Issues => "https://github.com/Shironex/kirei-manga/issues",
            // Points at the rewrite branch until it becomes master at 1.0.
            Self::Notices => {
                "https://github.com/Shironex/kirei-manga/blob/rewrite/tauri/THIRD_PARTY_NOTICES"
            }
        }
    }
}

#[tauri::command]
pub(crate) async fn open_link(link: Link) -> Result<(), String> {
    spawn_open(link.url().into()).await
}

/// The bundled third party notices, or null when the build carries none
/// (the renderer then links to the file in the repository).
#[tauri::command]
pub(crate) async fn third_party_notices<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Option<String>, String> {
    let Ok(dir) = app.path().resource_dir() else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || read_optional(&dir.join(NOTICES_RESOURCE)))
        .await
        .map_err(|error| error.to_string())?
}

fn read_optional(path: &Path) -> Result<Option<String>, String> {
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|error| error.to_string())
}

/// Hands a folder or URL to the OS: `open` on macOS, Explorer on Windows,
/// `xdg-open` elsewhere. No plugin needed for two fixed kinds of target.
async fn spawn_open(target: std::ffi::OsString) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let program = if cfg!(target_os = "macos") {
            "open"
        } else if cfg!(windows) {
            "explorer"
        } else {
            "xdg-open"
        };
        let status = Command::new(program)
            .arg(&target)
            .status()
            .map_err(|error| format!("cannot start {program}: {error}"))?;
        // Explorer exits with 1 even when it opened the target.
        if status.success() || cfg!(windows) {
            Ok(())
        } else {
            Err(format!("{program} exited with {status}"))
        }
    })
    .await
    .map_err(|error| error.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_are_https() {
        for link in [Link::Website, Link::Repository, Link::Issues, Link::Notices] {
            assert!(link.url().starts_with("https://"), "{link:?}");
        }
    }

    #[test]
    fn link_names_are_camel_case() {
        let link: Link = serde_json::from_value(serde_json::json!("repository")).unwrap();
        assert!(matches!(link, Link::Repository));
        assert!(serde_json::from_value::<Link>(serde_json::json!("https://evil.test")).is_err());
    }

    /// `DEFAULT_SETTINGS` in the renderer's contract must match the Rust
    /// defaults, key for key. Reads the TypeScript object literal line by line.
    #[test]
    fn renderer_defaults_match_rust() {
        let source = include_str!("../../src/lib/settings/contract.ts");
        let start = source
            .find("DEFAULT_SETTINGS")
            .expect("contract.ts declares DEFAULT_SETTINGS");
        let block = &source[start..];
        let block = &block[block.find('{').unwrap() + 1..block.find("})").unwrap()];
        let mut renderer = serde_json::Map::new();
        for line in block.lines().map(str::trim).filter(|l| !l.is_empty()) {
            let (key, value) = line.trim_end_matches(',').split_once(": ").unwrap();
            let value = value.replace('\'', "\"");
            renderer.insert(
                key.trim_matches('\'').to_owned(),
                serde_json::from_str(&value).unwrap(),
            );
        }
        let rust = serde_json::to_value(AppSettings::default()).unwrap();
        assert_eq!(serde_json::Value::Object(renderer), rust);
    }

    #[test]
    fn a_missing_notices_file_is_none() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(read_optional(&dir.path().join("nope")), Ok(None));
        std::fs::write(dir.path().join("n"), "MIT").unwrap();
        assert_eq!(
            read_optional(&dir.path().join("n")),
            Ok(Some("MIT".to_owned()))
        );
    }
}
