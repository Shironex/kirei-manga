use kirei_mangadex::MangaDexError;

/// Everything a download can fail with. Messages are shown in the queue as
/// they are, so they say what happened in plain words.
#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error(transparent)]
    MangaDex(#[from] MangaDexError),
    #[error("cannot write the download: {0}")]
    Io(#[from] std::io::Error),
    #[error("download queue: {0}")]
    Store(#[from] rusqlite::Error),
    #[error("cannot write the archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("`{0}` is not a MangaDex chapter id")]
    InvalidId(String),
    /// The chapter is hosted outside MangaDex (or has no pages), so there is
    /// nothing to download.
    #[error("this chapter is not hosted on MangaDex and cannot be downloaded")]
    NotHosted,
    #[error("MangaDex lists no series for this chapter")]
    NoSeries,
    #[error("the download queue was written by a newer KireiManga (version {0})")]
    NewerQueue(u32),
    #[error("page {index} is missing from the staging folder")]
    MissingPage { index: usize },
    #[error("the download stopped unexpectedly: {0}")]
    Task(String),
}

pub type Result<T> = std::result::Result<T, DownloadError>;
