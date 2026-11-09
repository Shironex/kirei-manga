//! Atomic CBZ writes.
//!
//! The archive is written to a hidden temporary file in the same folder as
//! its final name (`.<name>.part`), flushed to disk, and only then renamed
//! over the final name. A rename within one folder is atomic on every file
//! system the app supports, so the final name either does not exist, holds
//! the previous complete archive, or holds the new complete one; a process
//! killed at any point leaves at most a hidden `.part` file, which the
//! library scanner and watcher skip like any hidden file and the next attempt
//! overwrites. On Unix the folder is synced after the rename so the new name
//! survives a power cut too.

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use zip::CompressionMethod;
use zip::write::{SimpleFileOptions, ZipWriter};

use crate::error::Result;

/// The hidden temporary file an archive is written to before the rename.
pub fn temp_path(final_path: &Path) -> PathBuf {
    let name = final_path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    final_path.with_file_name(format!(".{name}.part"))
}

/// Writes `pages` (in order, each `(archive name, file on disk)`) and
/// `comic_info` into a CBZ at `final_path`, atomically.
pub fn write_atomic(
    final_path: &Path,
    pages: &[(String, PathBuf)],
    comic_info: &str,
) -> Result<()> {
    let temp = write_temp(final_path, pages, comic_info)?;
    commit(&temp, final_path)?;
    Ok(())
}

/// The first half of [`write_atomic`]: the complete archive under its
/// temporary name, synced to disk. Nothing visible changes yet.
pub(crate) fn write_temp(
    final_path: &Path,
    pages: &[(String, PathBuf)],
    comic_info: &str,
) -> Result<PathBuf> {
    if let Some(folder) = final_path.parent() {
        fs::create_dir_all(folder)?;
    }
    let temp = temp_path(final_path);
    let written = write_zip(&temp, pages, comic_info);
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written.map(|()| temp)
}

fn write_zip(temp: &Path, pages: &[(String, PathBuf)], comic_info: &str) -> Result<()> {
    let mut zip = ZipWriter::new(File::create(temp)?);
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // Page images are already compressed; deflating them costs time for
    // nothing.
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    zip.start_file("ComicInfo.xml", deflated)?;
    zip.write_all(comic_info.as_bytes())?;
    for (name, path) in pages {
        zip.start_file(name.as_str(), stored)?;
        let mut page = File::open(path)?;
        io::copy(&mut page, &mut zip)?;
    }
    let file = zip.finish()?;
    file.sync_all()?;
    Ok(())
}

/// The second half: renames the synced temporary file over the final name.
pub(crate) fn commit(temp: &Path, final_path: &Path) -> io::Result<()> {
    fs::rename(temp, final_path)?;
    sync_folder(final_path);
    Ok(())
}

#[cfg(unix)]
fn sync_folder(path: &Path) {
    if let Some(folder) = path.parent() {
        // Best effort: the archive itself is already complete on disk.
        if let Ok(folder) = File::open(folder) {
            let _ = folder.sync_all();
        }
    }
}

#[cfg(not(unix))]
fn sync_folder(_path: &Path) {}

/// The name a page gets inside the archive: `0001.jpg` and so on, so every
/// reader sorts them in order.
pub(crate) fn entry_name(index: usize, ext: &str) -> String {
    format!("{:04}.{ext}", index + 1)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pages(dir: &Path, count: usize) -> Vec<(String, PathBuf)> {
        (0..count)
            .map(|index| {
                let path = dir.join(format!("page{index}.jpg"));
                fs::write(&path, vec![index as u8; 100]).unwrap();
                (entry_name(index, "jpg"), path)
            })
            .collect()
    }

    fn entries(path: &Path) -> Vec<String> {
        let archive = zip::ZipArchive::new(File::open(path).unwrap()).unwrap();
        archive
            .file_names()
            .map(|name| name.unwrap().into_owned())
            .collect()
    }

    #[test]
    fn writes_comic_info_and_pages_in_order() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("Series/Ch.001.cbz");
        write_atomic(&target, &pages(dir.path(), 3), "<ComicInfo/>").unwrap();
        let mut names = entries(&target);
        names.sort();
        assert_eq!(
            names,
            vec!["0001.jpg", "0002.jpg", "0003.jpg", "ComicInfo.xml"]
        );
        assert!(!temp_path(&target).exists());
    }

    #[test]
    fn a_crash_before_the_rename_leaves_the_old_archive_whole() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("Ch.001.cbz");
        write_atomic(&target, &pages(dir.path(), 1), "<ComicInfo/>").unwrap();
        let before = fs::read(&target).unwrap();

        // The new archive is complete under its temporary name, then the
        // process dies before `commit`.
        let temp = write_temp(&target, &pages(dir.path(), 3), "<ComicInfo/>").unwrap();
        assert_eq!(fs::read(&target).unwrap(), before);
        assert!(temp.file_name().unwrap().to_string_lossy().starts_with('.'));

        // The next attempt overwrites the leftover and commits.
        write_atomic(&target, &pages(dir.path(), 3), "<ComicInfo/>").unwrap();
        assert_eq!(entries(&target).len(), 4);
        assert!(!temp.exists());
    }

    #[test]
    fn a_failed_write_leaves_nothing_behind() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("Ch.001.cbz");
        let missing = vec![(entry_name(0, "jpg"), dir.path().join("nope.jpg"))];
        assert!(write_atomic(&target, &missing, "<ComicInfo/>").is_err());
        assert!(!target.exists());
        assert!(!temp_path(&target).exists());
    }
}
