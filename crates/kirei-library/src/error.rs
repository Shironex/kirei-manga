use std::path::PathBuf;

/// Everything the library can fail with.
#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("library database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("cannot read {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error(
        "the library database is at schema {found}, newer than this app supports ({supported})"
    )]
    NewerSchema { found: u32, supported: u32 },
    #[error("{0} is not a folder")]
    NotAFolder(PathBuf),
    #[error("{path} overlaps the library folder {existing}")]
    OverlappingRoot { path: String, existing: String },
    #[error("a library scan is already running")]
    ScanInProgress,
    #[error("no {0} with id {1}")]
    NotFound(&'static str, i64),
    #[error(transparent)]
    Setting(#[from] kirei_core::SettingError),
    #[error("{0}")]
    InvalidBackup(String),
    #[error(
        "this backup was made by a newer KireiManga ({what} {found}, this app supports up to {supported}); update the app to restore it"
    )]
    NewerBackup {
        what: &'static str,
        found: u32,
        supported: u32,
    },
    #[error("{0}")]
    InvalidInput(String),
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
}

impl LibraryError {
    pub(crate) fn io(path: impl Into<PathBuf>, source: std::io::Error) -> Self {
        Self::Io {
            path: path.into(),
            source,
        }
    }
}

pub type Result<T> = std::result::Result<T, LibraryError>;
