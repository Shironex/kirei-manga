use std::path::{Path, PathBuf};

/// Everything that can go wrong opening or reading a page source.
#[derive(Debug, thiserror::Error)]
pub enum ArchiveError {
    #[error("cannot read {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("{0} is not a folder, ZIP/CBZ or RAR/CBR archive")]
    Unsupported(PathBuf),
    #[error("corrupt ZIP archive: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("corrupt RAR archive: {0}")]
    Rar(String),
    #[error("page {index} is out of range (the source has {len} pages)")]
    PageOutOfRange { index: usize, len: usize },
    #[error("entry {name} is {size} bytes, above the {max} byte limit")]
    EntryTooLarge { name: String, size: u64, max: u64 },
    #[error("archive lists {found} pages, above the {max} page limit")]
    TooManyPages { found: usize, max: usize },
    #[error("entry {0} is encrypted")]
    Encrypted(String),
    #[error("entry {0} disappeared from the archive")]
    MissingEntry(String),
}

impl ArchiveError {
    pub(crate) fn io(path: &Path, source: std::io::Error) -> Self {
        Self::Io {
            path: path.to_path_buf(),
            source,
        }
    }
}

pub type Result<T> = std::result::Result<T, ArchiveError>;
