//! Streaming page access for KireiManga: CBZ and ZIP, CBR (RAR) and plain image
//! folders, read in place without extracting anything to disk.
//!
//! [`open`] sniffs the path and returns a [`PageSource`]: the image entries in
//! natural reading order, with their pixel size read from the image headers,
//! and a way to read one page's bytes on demand. Non-image entries and OS junk
//! (`__MACOSX/`, `.DS_Store`, `Thumbs.db`, AppleDouble `._` files) are skipped.
//!
//! Hostile input is expected: entry names that escape the archive root are
//! dropped, every entry has a size ceiling that is enforced while reading (not
//! only from the header, which can lie), and the page count is capped.

mod error;
mod filter;
mod folder;
mod limits;
mod natural;
mod probe;
mod rar;
mod zip_source;

use std::fs::File;
use std::io::Read;
use std::path::Path;

use kirei_core::{PageInfo, SourceKind};

pub use error::{ArchiveError, Result};
pub use limits::{Limits, OpenOptions};
pub use natural::natural_cmp;

/// Ceiling for a `ComicInfo.xml`. Real ones are a few kilobytes even with a
/// full page table.
pub const MAX_COMIC_INFO_BYTES: u64 = 1024 * 1024;

/// A chapter's pages, wherever they are stored.
///
/// Implementations are `Send + Sync` so one source can serve the read-ahead
/// workers and the protocol handler at the same time.
pub trait PageSource: Send + Sync {
    /// What kind of container this is.
    fn kind(&self) -> SourceKind;

    /// The image pages in reading order. `pages()[i].index == i`.
    fn pages(&self) -> &[PageInfo];

    /// Reads one page's bytes (still encoded: JPEG, PNG, ...).
    fn read_page(&self, index: usize) -> Result<Vec<u8>>;

    /// The source's `ComicInfo.xml`, raw, when it has one at its root or one
    /// folder down. Capped at [`MAX_COMIC_INFO_BYTES`]; a larger file is
    /// treated as absent rather than read.
    fn comic_info(&self) -> Result<Option<Vec<u8>>> {
        Ok(None)
    }

    /// Number of pages.
    fn len(&self) -> usize {
        self.pages().len()
    }

    /// True when the source holds no image pages.
    fn is_empty(&self) -> bool {
        self.pages().is_empty()
    }
}

/// Opens `path` with the default [`OpenOptions`].
pub fn open(path: &Path) -> Result<Box<dyn PageSource>> {
    open_with(path, &OpenOptions::default())
}

/// Opens a directory of images, a ZIP/CBZ or a RAR/CBR archive. The container
/// type comes from the file's magic bytes, so a misnamed `.cbr` that is really
/// a ZIP still opens.
pub fn open_with(path: &Path, options: &OpenOptions) -> Result<Box<dyn PageSource>> {
    let metadata = std::fs::metadata(path).map_err(|source| ArchiveError::io(path, source))?;
    if metadata.is_dir() {
        return Ok(Box::new(folder::FolderSource::open(path, options)?));
    }
    match sniff(path)? {
        Some(SourceKind::Zip) => Ok(Box::new(zip_source::ZipSource::open(path, options)?)),
        Some(SourceKind::Rar) => Ok(Box::new(rar::RarSource::open(path, options)?)),
        _ => Err(ArchiveError::Unsupported(path.to_path_buf())),
    }
}

fn sniff(path: &Path) -> Result<Option<SourceKind>> {
    let mut magic = [0u8; 7];
    let mut file = File::open(path).map_err(|source| ArchiveError::io(path, source))?;
    let read =
        read_up_to(&mut file, &mut magic).map_err(|source| ArchiveError::io(path, source))?;
    let magic = &magic[..read];
    if magic.starts_with(b"PK\x03\x04") || magic.starts_with(b"PK\x05\x06") {
        Ok(Some(SourceKind::Zip))
    } else if magic.starts_with(b"Rar!\x1a\x07") {
        Ok(Some(SourceKind::Rar))
    } else {
        Ok(None)
    }
}

fn read_up_to(reader: &mut impl Read, buf: &mut [u8]) -> std::io::Result<usize> {
    let mut filled = 0;
    while filled < buf.len() {
        match reader.read(&mut buf[filled..])? {
            0 => break,
            n => filled += n,
        }
    }
    Ok(filled)
}

/// Shared tail of every backend: sort candidates naturally, cap the count and
/// number them.
pub(crate) fn finish_listing<T>(
    mut entries: Vec<(String, T)>,
    limits: &Limits,
) -> Result<Vec<(String, T)>> {
    if entries.len() > limits.max_pages {
        return Err(ArchiveError::TooManyPages {
            found: entries.len(),
            max: limits.max_pages,
        });
    }
    entries.sort_by(|a, b| natural_cmp(&a.0, &b.0));
    Ok(entries)
}
