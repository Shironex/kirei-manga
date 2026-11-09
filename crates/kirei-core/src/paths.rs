//! Where the app keeps its data: the one place that decides.
//!
//! An installed build keeps everything in the OS app data directory. A
//! portable build keeps everything in a `data` folder beside the app, so the
//! whole folder can move to another machine (or a USB stick) with its library.
//!
//! Portable mode is on when, in the folder that holds the app, there is a file
//! named [`PORTABLE_MARKER`] or a folder named [`PORTABLE_DATA_DIR`]:
//!
//! - Windows: the folder holding `KireiManga.exe`.
//! - macOS: the folder holding `KireiManga.app`, never inside the bundle. The
//!   bundle is replaced on update and writing into it breaks its signature.
//!
//! Every other crate asks [`DataPaths`] for a location instead of joining
//! file names onto a directory itself. This module is the one exception to
//! the crate's no-I/O rule: detection checks whether the marker exists.

use std::path::{Path, PathBuf};

use serde::Serialize;

/// Name of the marker file that turns portable mode on. Its contents are
/// ignored; an empty file works.
pub const PORTABLE_MARKER: &str = "portable";
/// Name of the data folder in portable mode. Its presence alone also turns
/// portable mode on.
pub const PORTABLE_DATA_DIR: &str = "data";

const DATABASE_FILE: &str = "library.sqlite3";
const COVERS_DIR: &str = "covers";
const LOGS_DIR: &str = "logs";
/// Same name the window-state plugin uses by default, so an installed build
/// keeps the file where it always was.
const WINDOW_STATE_FILE: &str = ".window-state.json";
const BACKUPS_DIR: &str = "backups";
const RESTORE_STAGING_DIR: &str = "restore-staging";
const RESTORE_PENDING_FILE: &str = "restore-pending";
const DOWNLOADS_DIR: &str = "downloads";
const DOWNLOAD_QUEUE_FILE: &str = "downloads.sqlite3";
const DOWNLOAD_STAGING_DIR: &str = "download-staging";

/// Which kind of data directory is in use.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DataMode {
    /// The OS app data directory.
    Installed,
    /// A `data` folder beside the app.
    Portable,
}

/// Every location the app writes to, derived from one root directory.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPaths {
    mode: DataMode,
    root: PathBuf,
}

impl DataPaths {
    /// Paths for a known root.
    pub fn new(mode: DataMode, root: impl Into<PathBuf>) -> Self {
        Self {
            mode,
            root: root.into(),
        }
    }

    /// Picks the data root for the running executable: the portable folder
    /// when the marker is present, else whatever `installed_root` returns
    /// (the shell passes the OS app data directory). `installed_root` is only
    /// called when the build is not portable.
    pub fn resolve<E>(
        exe: &Path,
        installed_root: impl FnOnce() -> Result<PathBuf, E>,
    ) -> Result<Self, E> {
        match portable_root(exe) {
            Some(root) => Ok(Self::new(DataMode::Portable, root)),
            None => installed_root().map(|root| Self::new(DataMode::Installed, root)),
        }
    }

    pub fn mode(&self) -> DataMode {
        self.mode
    }

    pub fn is_portable(&self) -> bool {
        self.mode == DataMode::Portable
    }

    /// The directory everything below lives in.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The library database (WAL mode, so `-wal` and `-shm` files sit beside it).
    pub fn database(&self) -> PathBuf {
        self.root.join(DATABASE_FILE)
    }

    /// The cover thumbnail cache.
    pub fn covers(&self) -> PathBuf {
        self.root.join(COVERS_DIR)
    }

    /// Log files.
    pub fn logs(&self) -> PathBuf {
        self.root.join(LOGS_DIR)
    }

    /// Saved window size and position.
    pub fn window_state(&self) -> PathBuf {
        self.root.join(WINDOW_STATE_FILE)
    }

    /// Folders of data set aside by a restore.
    pub fn backups(&self) -> PathBuf {
        self.root.join(BACKUPS_DIR)
    }

    /// Where a restore unpacks a backup before it is swapped in.
    pub fn restore_staging(&self) -> PathBuf {
        self.root.join(RESTORE_STAGING_DIR)
    }

    /// Present while a staged restore waits to be swapped in at launch.
    pub fn restore_pending(&self) -> PathBuf {
        self.root.join(RESTORE_PENDING_FILE)
    }

    /// The default downloads folder, added to the library as a root of its
    /// own. Users may point downloads somewhere else in Settings.
    pub fn downloads(&self) -> PathBuf {
        self.root.join(DOWNLOADS_DIR)
    }

    /// The download queue, a small SQLite file of its own so queue writes
    /// never contend with the library database.
    pub fn download_queue(&self) -> PathBuf {
        self.root.join(DOWNLOAD_QUEUE_FILE)
    }

    /// Pages of chapters still downloading, one folder per chapter. Kept out
    /// of every library root so a half finished chapter is never scanned.
    pub fn download_staging(&self) -> PathBuf {
        self.root.join(DOWNLOAD_STAGING_DIR)
    }
}

/// The portable data folder for `exe`, when portable mode is on.
pub fn portable_root(exe: &Path) -> Option<PathBuf> {
    let base = app_folder(exe)?;
    let data = base.join(PORTABLE_DATA_DIR);
    (base.join(PORTABLE_MARKER).is_file() || data.is_dir()).then_some(data)
}

/// The folder the user sees the app in: the executable's folder, or on macOS
/// the folder holding the `.app` bundle when the executable sits at
/// `Name.app/Contents/MacOS/<exe>`.
pub fn app_folder(exe: &Path) -> Option<PathBuf> {
    let exe_dir = exe.parent()?;
    let bundle = exe_dir
        .parent()
        .filter(|_| exe_dir.file_name().is_some_and(|n| n == "MacOS"))
        .filter(|contents| contents.file_name().is_some_and(|n| n == "Contents"))
        .and_then(Path::parent)
        .filter(|bundle| bundle.extension().is_some_and(|ext| ext == "app"));
    match bundle {
        Some(bundle) => bundle.parent().map(Path::to_path_buf),
        None => Some(exe_dir.to_path_buf()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir =
            std::env::temp_dir().join(format!("kirei-core-paths-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_plain_executable_uses_its_own_folder() {
        let exe = Path::new("/opt/kirei/KireiManga.exe");
        assert_eq!(app_folder(exe), Some(PathBuf::from("/opt/kirei")));
    }

    #[test]
    fn a_macos_bundle_uses_the_folder_around_the_app() {
        let exe = Path::new("/Users/me/Apps/KireiManga.app/Contents/MacOS/kirei-desktop");
        assert_eq!(app_folder(exe), Some(PathBuf::from("/Users/me/Apps")));
    }

    #[test]
    fn a_macos_folder_outside_a_bundle_is_not_treated_as_one() {
        let exe = Path::new("/build/Contents/MacOS/kirei-desktop");
        assert_eq!(
            app_folder(exe),
            Some(PathBuf::from("/build/Contents/MacOS"))
        );
    }

    #[test]
    fn without_a_marker_the_installed_root_is_used() {
        let dir = temp_dir("installed");
        let exe = dir.join("KireiManga.exe");
        let paths =
            DataPaths::resolve(&exe, || Ok::<_, ()>(PathBuf::from("/appdata/kirei"))).unwrap();
        assert_eq!(paths.mode(), DataMode::Installed);
        assert_eq!(paths.root(), Path::new("/appdata/kirei"));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_marker_file_turns_portable_mode_on() {
        let dir = temp_dir("marker");
        std::fs::write(dir.join(PORTABLE_MARKER), b"").unwrap();
        let exe = dir.join("KireiManga.exe");
        let paths = DataPaths::resolve(&exe, || -> Result<PathBuf, ()> {
            panic!("the installed root must not be asked for")
        })
        .unwrap();
        assert!(paths.is_portable());
        assert_eq!(paths.root(), dir.join(PORTABLE_DATA_DIR));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_data_folder_turns_portable_mode_on() {
        let dir = temp_dir("datafolder");
        std::fs::create_dir(dir.join(PORTABLE_DATA_DIR)).unwrap();
        let exe = dir.join("KireiManga.app/Contents/MacOS/kirei-desktop");
        assert_eq!(portable_root(&exe), Some(dir.join(PORTABLE_DATA_DIR)));
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn every_location_sits_under_the_root() {
        let paths = DataPaths::new(DataMode::Portable, "/x/data");
        for path in [
            paths.database(),
            paths.covers(),
            paths.logs(),
            paths.window_state(),
            paths.backups(),
            paths.restore_staging(),
            paths.restore_pending(),
            paths.downloads(),
            paths.download_queue(),
            paths.download_staging(),
        ] {
            assert!(path.starts_with("/x/data"), "{path:?}");
        }
        assert_eq!(paths.database(), Path::new("/x/data/library.sqlite3"));
    }
}
