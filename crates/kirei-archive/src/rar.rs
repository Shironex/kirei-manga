use std::collections::HashMap;
use std::path::{Path, PathBuf};

use kirei_core::{ImageFormat, PageInfo, SourceKind};
use unrar::Archive;

use crate::filter::{normalize_name, page_format};
use crate::{ArchiveError, OpenOptions, PageSource, Result, finish_listing, probe};

/// A RAR or CBR file, read through RARLAB's UnRAR.
///
/// UnRAR has no random access: reading a page walks the headers from the start
/// and skips every entry before it. Skipping a stored or non-solid entry is a
/// seek, so this stays cheap; in a solid archive skipping means decompressing,
/// which is exactly why the read-ahead cache sits above this layer.
pub(crate) struct RarSource {
    path: PathBuf,
    pages: Vec<PageInfo>,
    /// Position of each page's header in the archive, counted over all headers.
    header_ordinal: Vec<usize>,
    max_entry_bytes: u64,
}

struct Candidate {
    ordinal: usize,
    format: ImageFormat,
    size: u64,
}

fn rar_error(error: unrar::error::UnrarError) -> ArchiveError {
    ArchiveError::Rar(error.to_string())
}

impl RarSource {
    pub(crate) fn open(path: &Path, options: &OpenOptions) -> Result<Self> {
        let listing = Archive::new(path).open_for_listing().map_err(rar_error)?;
        let mut candidates = Vec::new();
        for (ordinal, header) in listing.enumerate() {
            let header = header.map_err(rar_error)?;
            if !header.is_file() || header.is_encrypted() || header.is_split() {
                continue;
            }
            let Some(name) = header.filename.to_str().and_then(normalize_name) else {
                continue;
            };
            let Some(format) = page_format(&name) else {
                continue;
            };
            let size = header.unpacked_size;
            candidates.push((
                name,
                Candidate {
                    ordinal,
                    format,
                    size,
                },
            ));
        }
        let candidates = finish_listing(candidates, &options.limits)?;

        let sizes = if options.probe_dimensions {
            probe_all(path, &candidates, options.limits.max_entry_bytes)
        } else {
            HashMap::new()
        };

        let mut pages = Vec::with_capacity(candidates.len());
        let mut header_ordinal = Vec::with_capacity(candidates.len());
        for (index, (name, candidate)) in candidates.into_iter().enumerate() {
            let (width, height) = sizes.get(&candidate.ordinal).copied().unzip();
            pages.push(PageInfo {
                index,
                name,
                format: candidate.format,
                width,
                height,
                byte_len: candidate.size,
            });
            header_ordinal.push(candidate.ordinal);
        }

        Ok(Self {
            path: path.to_path_buf(),
            pages,
            header_ordinal,
            max_entry_bytes: options.limits.max_entry_bytes,
        })
    }
}

/// One sequential pass that decompresses every page once and keeps only its
/// pixel size. Failures leave the page without a size instead of failing open.
fn probe_all(
    path: &Path,
    candidates: &[(String, Candidate)],
    max_entry_bytes: u64,
) -> HashMap<usize, (u32, u32)> {
    let wanted: HashMap<usize, u64> = candidates
        .iter()
        .filter(|(_, c)| c.size <= max_entry_bytes)
        .map(|(_, c)| (c.ordinal, c.size))
        .collect();
    let mut sizes = HashMap::new();
    let Ok(mut cursor) = Archive::new(path).open_for_processing() else {
        return sizes;
    };
    let mut ordinal = 0;
    loop {
        let Ok(Some(entry)) = cursor.read_header() else {
            break;
        };
        let next = if wanted.contains_key(&ordinal) {
            match entry.read() {
                Ok((bytes, next)) => {
                    if let Some(size) = probe::dimensions_from_bytes(&bytes) {
                        sizes.insert(ordinal, size);
                    }
                    next
                }
                Err(_) => break,
            }
        } else {
            match entry.skip() {
                Ok(next) => next,
                Err(_) => break,
            }
        };
        cursor = next;
        ordinal += 1;
    }
    sizes
}

impl PageSource for RarSource {
    fn kind(&self) -> SourceKind {
        SourceKind::Rar
    }

    fn pages(&self) -> &[PageInfo] {
        &self.pages
    }

    fn read_page(&self, index: usize) -> Result<Vec<u8>> {
        let page = self.pages.get(index).ok_or(ArchiveError::PageOutOfRange {
            index,
            len: self.pages.len(),
        })?;
        // UnRAR inflates a whole entry into one buffer and cannot be stopped
        // part way, so the header size is the only ceiling available here.
        if page.byte_len > self.max_entry_bytes {
            return Err(ArchiveError::EntryTooLarge {
                name: page.name.clone(),
                size: page.byte_len,
                max: self.max_entry_bytes,
            });
        }
        let target = self.header_ordinal[index];
        let mut cursor = Archive::new(&self.path)
            .open_for_processing()
            .map_err(rar_error)?;
        let mut ordinal = 0;
        while let Some(entry) = cursor.read_header().map_err(rar_error)? {
            if ordinal == target {
                let (bytes, _) = entry.read().map_err(rar_error)?;
                if bytes.len() as u64 > self.max_entry_bytes {
                    return Err(ArchiveError::EntryTooLarge {
                        name: page.name.clone(),
                        size: bytes.len() as u64,
                        max: self.max_entry_bytes,
                    });
                }
                return Ok(bytes);
            }
            cursor = entry.skip().map_err(rar_error)?;
            ordinal += 1;
        }
        Err(ArchiveError::MissingEntry(page.name.clone()))
    }
}
