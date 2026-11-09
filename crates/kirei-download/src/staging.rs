//! Pages of a chapter still downloading, one folder per chapter under the
//! staging directory (`<data>/download-staging/<chapter id>/`).
//!
//! A page is written to `.NNNN.tmp`, synced and renamed to `NNNN.<ext>`, so a
//! file with a final name is always a whole page. Resume lists the final
//! names and fetches only the rest; leftover `.tmp` files are overwritten.

use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// The staging folder of one chapter.
#[derive(Debug, Clone)]
pub(crate) struct Staging {
    dir: PathBuf,
}

impl Staging {
    /// `chapter_id` must already be validated (see `crate::valid_id`).
    pub(crate) fn new(root: &Path, chapter_id: &str) -> Self {
        Self {
            dir: root.join(chapter_id),
        }
    }

    pub(crate) fn create(&self) -> io::Result<()> {
        fs::create_dir_all(&self.dir)
    }

    /// Finished pages by index.
    pub(crate) fn finished(&self) -> io::Result<BTreeMap<usize, PathBuf>> {
        let mut pages = BTreeMap::new();
        let entries = match fs::read_dir(&self.dir) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(pages),
            Err(error) => return Err(error),
        };
        for entry in entries {
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            let Some((stem, ext)) = name.split_once('.') else {
                continue;
            };
            if stem.len() == 4
                && stem.chars().all(|c| c.is_ascii_digit())
                && valid_ext(ext)
                && let Ok(index) = stem.parse::<usize>()
            {
                pages.insert(index, entry.path());
            }
        }
        Ok(pages)
    }

    /// Writes one page atomically and returns its final path.
    pub(crate) fn write_page(&self, index: usize, ext: &str, bytes: &[u8]) -> io::Result<PathBuf> {
        self.create()?;
        let temp = self.dir.join(format!(".{index:04}.tmp"));
        let path = self.dir.join(format!("{index:04}.{ext}"));
        {
            let mut file = File::create(&temp)?;
            file.write_all(bytes)?;
            file.sync_all()?;
        }
        fs::rename(&temp, &path)?;
        Ok(path)
    }

    /// Deletes the folder and everything in it. A folder that is already
    /// gone is fine.
    pub(crate) fn remove(&self) -> io::Result<()> {
        match fs::remove_dir_all(&self.dir) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
            _ => Ok(()),
        }
    }
}

fn valid_ext(ext: &str) -> bool {
    (1..=5).contains(&ext.len()) && ext.chars().all(|c| c.is_ascii_alphanumeric())
}

/// The extension a page is stored under, from its MangaDex file name, else
/// from the content type, else `jpg`.
pub(crate) fn page_ext(file_name: &str, content_type: Option<&str>) -> String {
    let from_name = Path::new(file_name)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(str::to_ascii_lowercase)
        .filter(|ext| valid_ext(ext));
    from_name
        .or_else(|| {
            let mime = content_type?.split(';').next()?.trim();
            Some(
                match mime {
                    "image/png" => "png",
                    "image/webp" => "webp",
                    "image/gif" => "gif",
                    _ => "jpg",
                }
                .to_owned(),
            )
        })
        .unwrap_or_else(|| "jpg".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_whole_pages_count_as_finished() {
        let dir = tempfile::tempdir().unwrap();
        let staging = Staging::new(dir.path(), "chapter");
        staging.write_page(0, "png", b"one").unwrap();
        staging.write_page(2, "jpg", b"three").unwrap();
        // A page cut off mid write: only its temporary name exists.
        fs::write(dir.path().join("chapter/.0001.tmp"), b"half").unwrap();
        fs::write(dir.path().join("chapter/notes.txt"), b"x").unwrap();
        let finished = staging.finished().unwrap();
        assert_eq!(finished.keys().copied().collect::<Vec<_>>(), vec![0, 2]);
        assert_eq!(fs::read(&finished[&2]).unwrap(), b"three");
        staging.remove().unwrap();
        assert!(staging.finished().unwrap().is_empty());
        staging.remove().unwrap();
    }

    #[test]
    fn extensions_come_from_the_name_then_the_type() {
        assert_eq!(page_ext("x1-abc.PNG", None), "png");
        assert_eq!(page_ext("noext", Some("image/webp")), "webp");
        assert_eq!(page_ext("weird.ex/t", None), "jpg");
        assert_eq!(page_ext("", None), "jpg");
    }
}
