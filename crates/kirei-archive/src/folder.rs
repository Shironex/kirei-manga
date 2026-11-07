use std::fs::File;
use std::path::{Path, PathBuf};

use kirei_core::{PageInfo, SourceKind};

use crate::filter::page_format;
use crate::limits::read_capped;
use crate::{ArchiveError, OpenOptions, PageSource, Result, finish_listing, probe};

/// A directory of image files. Only its direct children are pages: a series
/// folder with one subfolder per chapter is the library scanner's job, not a
/// single chapter.
pub(crate) struct FolderSource {
    root: PathBuf,
    pages: Vec<PageInfo>,
    max_entry_bytes: u64,
}

impl FolderSource {
    pub(crate) fn open(root: &Path, options: &OpenOptions) -> Result<Self> {
        let entries = std::fs::read_dir(root).map_err(|source| ArchiveError::io(root, source))?;
        let mut candidates = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|source| ArchiveError::io(root, source))?;
            // Symlinks are followed by `metadata`, so a link to an image is a
            // page; a link to a directory is not.
            let Ok(metadata) = std::fs::metadata(entry.path()) else {
                continue;
            };
            if !metadata.is_file() {
                continue;
            }
            // Names that are not valid Unicode cannot round-trip through the
            // webview, so they are skipped rather than shown mangled.
            let Ok(name) = entry.file_name().into_string() else {
                continue;
            };
            let Some(format) = page_format(&name) else {
                continue;
            };
            candidates.push((name, (format, metadata.len())));
        }
        let candidates = finish_listing(candidates, &options.limits)?;

        let pages = candidates
            .into_iter()
            .enumerate()
            .map(|(index, (name, (format, byte_len)))| {
                let (width, height) = if options.probe_dimensions {
                    probe_file(&root.join(&name)).unzip()
                } else {
                    (None, None)
                };
                PageInfo {
                    index,
                    name,
                    format,
                    width,
                    height,
                    byte_len,
                }
            })
            .collect();

        Ok(Self {
            root: root.to_path_buf(),
            pages,
            max_entry_bytes: options.limits.max_entry_bytes,
        })
    }
}

fn probe_file(path: &Path) -> Option<(u32, u32)> {
    let mut file = File::open(path).ok()?;
    probe::dimensions_from_reader(&mut file)
}

impl PageSource for FolderSource {
    fn kind(&self) -> SourceKind {
        SourceKind::Folder
    }

    fn pages(&self) -> &[PageInfo] {
        &self.pages
    }

    fn read_page(&self, index: usize) -> Result<Vec<u8>> {
        let page = self.pages.get(index).ok_or(ArchiveError::PageOutOfRange {
            index,
            len: self.pages.len(),
        })?;
        let path = self.root.join(&page.name);
        let mut file = File::open(&path).map_err(|source| ArchiveError::io(&path, source))?;
        let declared = file.metadata().map(|m| m.len()).unwrap_or(page.byte_len);
        read_capped(&mut file, &page.name, declared, self.max_entry_bytes)
    }
}
