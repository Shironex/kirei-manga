use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::Mutex;

use kirei_core::{ImageFormat, PageInfo, SourceKind};
use zip::ZipArchive;

use crate::filter::{normalize_name, page_format};
use crate::limits::read_capped;
use crate::{ArchiveError, OpenOptions, PageSource, Result, finish_listing, probe};

type Archive = ZipArchive<BufReader<File>>;

/// A ZIP or CBZ file. Only the central directory is read on open; each page is
/// inflated on demand straight into memory.
pub(crate) struct ZipSource {
    archive: Mutex<Archive>,
    pages: Vec<PageInfo>,
    /// Index into the ZIP's own entry table, per page.
    entry_index: Vec<usize>,
    max_entry_bytes: u64,
}

struct Candidate {
    entry: usize,
    format: ImageFormat,
    size: u64,
}

impl ZipSource {
    pub(crate) fn open(path: &Path, options: &OpenOptions) -> Result<Self> {
        let file = File::open(path).map_err(|source| ArchiveError::io(path, source))?;
        let mut archive = ZipArchive::new(BufReader::new(file))?;

        let mut candidates = Vec::new();
        for entry in 0..archive.len() {
            let file = archive.by_index_raw(entry)?;
            if !file.is_file() || file.encrypted() {
                continue;
            }
            let Some(name) = file.name().ok().as_deref().and_then(normalize_name) else {
                continue;
            };
            let Some(format) = page_format(&name) else {
                continue;
            };
            let size = file.size();
            candidates.push((
                name,
                Candidate {
                    entry,
                    format,
                    size,
                },
            ));
        }
        let candidates = finish_listing(candidates, &options.limits)?;

        let mut pages = Vec::with_capacity(candidates.len());
        let mut entry_index = Vec::with_capacity(candidates.len());
        for (index, (name, candidate)) in candidates.into_iter().enumerate() {
            let (width, height) = if options.probe_dimensions {
                probe_entry(&mut archive, candidate.entry).unzip()
            } else {
                (None, None)
            };
            pages.push(PageInfo {
                index,
                name,
                format: candidate.format,
                width,
                height,
                byte_len: candidate.size,
            });
            entry_index.push(candidate.entry);
        }

        Ok(Self {
            archive: Mutex::new(archive),
            pages,
            entry_index,
            max_entry_bytes: options.limits.max_entry_bytes,
        })
    }
}

/// A corrupt entry gets no size rather than failing the whole open; reading it
/// later reports the real error.
fn probe_entry(archive: &mut Archive, entry: usize) -> Option<(u32, u32)> {
    let mut file = archive.by_index(entry).ok()?;
    probe::dimensions_from_reader(&mut file)
}

impl PageSource for ZipSource {
    fn kind(&self) -> SourceKind {
        SourceKind::Zip
    }

    fn pages(&self) -> &[PageInfo] {
        &self.pages
    }

    fn read_page(&self, index: usize) -> Result<Vec<u8>> {
        let page = self.pages.get(index).ok_or(ArchiveError::PageOutOfRange {
            index,
            len: self.pages.len(),
        })?;
        let entry = self.entry_index[index];
        // A poisoned lock only means another reader panicked mid-read; the
        // archive handle itself is still usable, since every read seeks first.
        let mut archive = self
            .archive
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let mut file = archive.by_index(entry)?;
        read_capped(&mut file, &page.name, page.byte_len, self.max_entry_bytes)
    }
}
