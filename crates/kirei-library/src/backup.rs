//! Backup files and restoring them.
//!
//! A backup is one ZIP file (extension [`BACKUP_EXTENSION`]) holding:
//!
//! - `manifest.json`: a [`BackupManifest`] (app version, schema version,
//!   creation time, a BLAKE3 hash of the database).
//! - `library.sqlite3`: a consistent copy of the live database made with
//!   `VACUUM INTO`, never a raw copy of a file SQLite may be writing.
//! - `covers/...`: the thumbnail cache, only when asked for (it can be
//!   rebuilt by a scan, so it is off by default).
//!
//! The user's manga files are never part of a backup.
//!
//! Restoring is two steps so the live database is never replaced while it is
//! open: [`stage_restore`] validates the backup and unpacks it into a staging
//! folder, then [`apply_pending_restore`] swaps it in at the next launch,
//! before the library opens, and keeps the previous data in a dated folder
//! under `backups/`.

use std::fs::File;
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::{Component, Path, PathBuf};

use kirei_core::DataPaths;
use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::db::SCHEMA_VERSION;
use crate::{Library, LibraryError, Result, now_ms};

/// File extension of a backup, without the dot.
pub const BACKUP_EXTENSION: &str = "kireibackup";
/// Layout version of the backup file. Bumped only when the ZIP layout
/// changes; the database schema has its own version in the manifest.
pub const BACKUP_FORMAT: u32 = 1;

const APP_NAME: &str = "KireiManga";
const MANIFEST_ENTRY: &str = "manifest.json";
const DATABASE_ENTRY: &str = "library.sqlite3";
const COVERS_PREFIX: &str = "covers/";
/// A manifest is a few hundred bytes; anything far larger is not one.
const MAX_MANIFEST_BYTES: u64 = 64 * 1024;

/// What a backup holds, stored as `manifest.json` inside it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    /// Always `KireiManga`.
    pub app: String,
    /// [`BACKUP_FORMAT`] of the build that wrote it.
    pub format: u32,
    /// Version of the build that wrote it.
    pub app_version: String,
    /// Database schema version inside the backup.
    pub schema_version: u32,
    /// Unix milliseconds (UTC).
    pub created_at: i64,
    pub includes_covers: bool,
    pub cover_count: usize,
    pub database_bytes: u64,
    /// Hex BLAKE3 of the database entry.
    pub database_blake3: String,
}

/// Choices for [`Library::create_backup`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupOptions {
    /// Recorded in the manifest.
    pub app_version: String,
    /// Also pack the cover thumbnails.
    pub include_covers: bool,
}

/// What [`apply_pending_restore`] did.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub manifest: BackupManifest,
    /// Folder the replaced data was moved to.
    pub previous_data: PathBuf,
}

impl Library {
    /// Writes a backup of the database (and the covers, when asked) to
    /// `dest`. The file appears only once complete: it is written beside
    /// `dest` and renamed into place. The database lock is held only while
    /// SQLite copies the database.
    pub fn create_backup(&self, dest: &Path, options: &BackupOptions) -> Result<BackupManifest> {
        let partial = with_suffix(dest, ".partial");
        let db_copy = with_suffix(dest, ".db.partial");
        remove_file_if_exists(&partial)?;
        remove_file_if_exists(&db_copy)?;

        let result = (|| {
            self.vacuum_into(&db_copy)?;
            let manifest_and_zip = write_backup(&db_copy, &partial, self.cover_dir(), options)?;
            std::fs::rename(&partial, dest).map_err(|source| LibraryError::io(dest, source))?;
            Ok(manifest_and_zip)
        })();
        let _ = std::fs::remove_file(&db_copy);
        if result.is_err() {
            let _ = std::fs::remove_file(&partial);
        }
        result
    }

    /// A consistent, compacted copy of the live database at `dest`.
    fn vacuum_into(&self, dest: &Path) -> Result<()> {
        let dest_str = dest.to_str().ok_or_else(|| {
            LibraryError::InvalidBackup(format!("{} is not UTF-8", dest.display()))
        })?;
        self.conn().execute("VACUUM INTO ?1", [dest_str])?;
        Ok(())
    }
}

fn write_backup(
    db_copy: &Path,
    dest: &Path,
    cover_dir: &Path,
    options: &BackupOptions,
) -> Result<BackupManifest> {
    let (database_blake3, database_bytes) = hash_file(db_copy)?;
    let schema_version = {
        let conn = Connection::open_with_flags(db_copy, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
        crate::db::schema_version(&conn)?
    };
    let covers = if options.include_covers {
        list_files(cover_dir)?
    } else {
        Vec::new()
    };
    let manifest = BackupManifest {
        app: APP_NAME.to_owned(),
        format: BACKUP_FORMAT,
        app_version: options.app_version.clone(),
        schema_version,
        created_at: now_ms(),
        includes_covers: options.include_covers,
        cover_count: covers.len(),
        database_bytes,
        database_blake3,
    };

    let file = File::create(dest).map_err(|source| LibraryError::io(dest, source))?;
    let mut zip = ZipWriter::new(BufWriter::new(file));
    let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    // Thumbnails are JPEG already; deflating them again gains nothing.
    let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    let zip_error = |error: zip::result::ZipError| LibraryError::io(dest, error.into());
    let io_error = |error: std::io::Error| LibraryError::io(dest, error);

    zip.start_file(MANIFEST_ENTRY, deflated)
        .map_err(zip_error)?;
    zip.write_all(&serde_json::to_vec_pretty(&manifest)?)
        .map_err(io_error)?;

    zip.start_file(
        DATABASE_ENTRY,
        deflated.large_file(database_bytes >= u64::from(u32::MAX)),
    )
    .map_err(zip_error)?;
    let mut db = File::open(db_copy).map_err(|source| LibraryError::io(db_copy, source))?;
    std::io::copy(&mut db, &mut zip).map_err(io_error)?;

    for relative in &covers {
        zip.start_file(format!("{COVERS_PREFIX}{relative}"), stored)
            .map_err(zip_error)?;
        let source = cover_dir.join(relative);
        let mut thumb = File::open(&source).map_err(|e| LibraryError::io(&source, e))?;
        std::io::copy(&mut thumb, &mut zip).map_err(io_error)?;
    }

    let writer = zip.finish().map_err(zip_error)?;
    let file = writer
        .into_inner()
        .map_err(|error| LibraryError::io(dest, error.into_error()))?;
    file.sync_all().map_err(io_error)?;
    Ok(manifest)
}

/// Checks a backup without touching the live data: reads the manifest,
/// refuses a newer format or schema, unpacks the database into `scratch` (a
/// folder this call creates and removes) and verifies its hash and integrity.
/// This is the dry run of a restore.
pub fn inspect_backup(path: &Path, scratch: &Path) -> Result<BackupManifest> {
    reset_dir(scratch)?;
    let result = unpack(path, scratch, false);
    let _ = std::fs::remove_dir_all(scratch);
    result
}

/// Validates the backup at `path` and unpacks it into the staging folder.
/// Nothing live changes until [`apply_pending_restore`] runs at the next
/// launch; the app should restart after this returns.
pub fn stage_restore(path: &Path, paths: &DataPaths) -> Result<BackupManifest> {
    let staging = paths.restore_staging();
    let pending = paths.restore_pending();
    remove_file_if_exists(&pending)?;
    reset_dir(&staging)?;
    let manifest = match unpack(path, &staging, true) {
        Ok(manifest) => manifest,
        Err(error) => {
            let _ = std::fs::remove_dir_all(&staging);
            return Err(error);
        }
    };
    // The marker is written last, so a staging folder without it is an
    // aborted restore and is ignored.
    let tmp = with_suffix(&pending, ".tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&manifest)?)
        .map_err(|source| LibraryError::io(&tmp, source))?;
    std::fs::rename(&tmp, &pending).map_err(|source| LibraryError::io(&pending, source))?;
    Ok(manifest)
}

/// Swaps a staged restore in. Call at launch, before the library opens.
/// Returns `None` when nothing was pending.
///
/// The live database (with its `-wal` and `-shm` files), and the cover cache
/// when the backup carries covers, move to `backups/pre-restore-<UTC time>`;
/// then the staged files move into their place. Every step is a rename inside
/// the data folder. If a step fails, what was moved goes back. If the process
/// dies half way, the marker is still there and the next launch finishes the
/// job; nothing is deleted until the swap is complete.
pub fn apply_pending_restore(paths: &DataPaths) -> Result<Option<RestoreOutcome>> {
    let pending = paths.restore_pending();
    let staging = paths.restore_staging();
    if !pending.is_file() {
        if staging.exists() {
            let _ = std::fs::remove_dir_all(&staging);
        }
        return Ok(None);
    }
    let manifest: BackupManifest = serde_json::from_slice(
        &std::fs::read(&pending).map_err(|source| LibraryError::io(&pending, source))?,
    )?;
    let staged_db = staging.join(DATABASE_ENTRY);
    if !staged_db.is_file() {
        // An earlier launch already moved it in and died before cleaning up.
        finish(&pending, &staging);
        return Ok(None);
    }

    let previous_data = unique_dir(
        &paths.backups(),
        &format!("pre-restore-{}", stamp(now_ms())),
    )?;
    let database = paths.database();
    let mut live = vec![
        database.clone(),
        with_suffix(&database, "-wal"),
        with_suffix(&database, "-shm"),
    ];
    let mut staged = vec![(staged_db, database)];
    if manifest.includes_covers {
        live.push(paths.covers());
        staged.push((staging.join("covers"), paths.covers()));
    }

    let mut moved: Vec<(PathBuf, PathBuf)> = Vec::new();
    let result = (|| {
        for path in &live {
            if path.exists() {
                let name = path.file_name().unwrap_or_default();
                let aside = previous_data.join(name);
                rename(path, &aside)?;
                moved.push((aside, path.clone()));
            }
        }
        for (from, to) in &staged {
            if from.exists() {
                rename(from, to)?;
                moved.push((to.clone(), from.clone()));
            }
        }
        Ok(())
    })();

    if let Err(error) = result {
        for (from, to) in moved.iter().rev() {
            let _ = std::fs::rename(from, to);
        }
        finish(&pending, &staging);
        let _ = std::fs::remove_dir(&previous_data);
        return Err(error);
    }
    finish(&pending, &staging);
    Ok(Some(RestoreOutcome {
        manifest,
        previous_data,
    }))
}

/// Opens the backup, validates it and writes its database (and covers, when
/// `with_covers` and present) into `dir`.
fn unpack(path: &Path, dir: &Path, with_covers: bool) -> Result<BackupManifest> {
    let file = File::open(path).map_err(|source| LibraryError::io(path, source))?;
    let mut zip = ZipArchive::new(BufReader::new(file)).map_err(|error| damaged(path, &error))?;

    let manifest: BackupManifest = {
        let entry = zip
            .by_name(MANIFEST_ENTRY)
            .map_err(|_| invalid(path, "it has no manifest"))?;
        let mut text = Vec::new();
        entry
            .take(MAX_MANIFEST_BYTES)
            .read_to_end(&mut text)
            .map_err(|error| damaged(path, &error))?;
        serde_json::from_slice(&text).map_err(|_| invalid(path, "its manifest is unreadable"))?
    };
    if manifest.app != APP_NAME {
        return Err(invalid(path, "it was not made by KireiManga"));
    }
    if manifest.format > BACKUP_FORMAT {
        return Err(LibraryError::NewerBackup {
            what: "backup format",
            found: manifest.format,
            supported: BACKUP_FORMAT,
        });
    }
    if manifest.schema_version > SCHEMA_VERSION {
        return Err(LibraryError::NewerBackup {
            what: "library schema",
            found: manifest.schema_version,
            supported: SCHEMA_VERSION,
        });
    }

    let db_path = dir.join(DATABASE_ENTRY);
    {
        let mut entry = zip
            .by_name(DATABASE_ENTRY)
            .map_err(|_| invalid(path, "it has no library database"))?;
        let mut out = File::create(&db_path).map_err(|e| LibraryError::io(&db_path, e))?;
        let mut hasher = blake3::Hasher::new();
        let mut written = 0u64;
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            let n = entry
                .read(&mut buf)
                .map_err(|error| damaged(path, &error))?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
            out.write_all(&buf[..n])
                .map_err(|e| LibraryError::io(&db_path, e))?;
            written += n as u64;
        }
        out.sync_all().map_err(|e| LibraryError::io(&db_path, e))?;
        if written != manifest.database_bytes
            || hasher.finalize().to_hex().as_str() != manifest.database_blake3
        {
            return Err(invalid(path, "its database does not match the manifest"));
        }
    }
    check_database(&db_path, manifest.schema_version)
        .map_err(|_| invalid(path, "its database is damaged"))?;

    if with_covers && manifest.includes_covers {
        let covers = dir.join("covers");
        for index in 0..zip.len() {
            let mut entry = zip.by_index(index).map_err(|error| damaged(path, &error))?;
            if !entry.is_file() {
                continue;
            }
            let Some(relative) = entry
                .enclosed_name()
                .and_then(|name| name.strip_prefix("covers").ok().map(Path::to_path_buf))
            else {
                continue;
            };
            if relative.as_os_str().is_empty()
                || !relative
                    .components()
                    .all(|c| matches!(c, Component::Normal(_)))
            {
                continue;
            }
            let target = covers.join(relative);
            if let Some(parent) = target.parent() {
                std::fs::create_dir_all(parent).map_err(|e| LibraryError::io(parent, e))?;
            }
            let mut out = File::create(&target).map_err(|e| LibraryError::io(&target, e))?;
            std::io::copy(&mut entry, &mut out).map_err(|error| damaged(path, &error))?;
        }
    }
    Ok(manifest)
}

/// Runs SQLite's own integrity check and confirms the schema version.
fn check_database(db: &Path, schema_version: u32) -> Result<()> {
    let conn = Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let check: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    let found = crate::db::schema_version(&conn)?;
    if check != "ok" || found != schema_version {
        return Err(LibraryError::InvalidBackup(check));
    }
    Ok(())
}

fn invalid(path: &Path, why: &str) -> LibraryError {
    LibraryError::InvalidBackup(format!(
        "{} is not a usable KireiManga backup: {why}",
        path.display()
    ))
}

fn damaged(path: &Path, error: &dyn std::fmt::Display) -> LibraryError {
    LibraryError::InvalidBackup(format!(
        "{} is damaged or not a KireiManga backup ({error})",
        path.display()
    ))
}

fn hash_file(path: &Path) -> Result<(String, u64)> {
    let mut file = File::open(path).map_err(|source| LibraryError::io(path, source))?;
    let mut hasher = blake3::Hasher::new();
    let bytes =
        std::io::copy(&mut file, &mut hasher).map_err(|source| LibraryError::io(path, source))?;
    Ok((hasher.finalize().to_hex().to_string(), bytes))
}

/// Every file under `dir`, relative, with `/` separators, sorted.
fn list_files(dir: &Path) -> Result<Vec<String>> {
    let mut out = Vec::new();
    let mut stack = vec![(dir.to_path_buf(), String::new())];
    while let Some((next, prefix)) = stack.pop() {
        let entries = match std::fs::read_dir(&next) {
            Ok(entries) => entries,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(source) => return Err(LibraryError::io(&next, source)),
        };
        for entry in entries {
            let entry = entry.map_err(|source| LibraryError::io(&next, source))?;
            let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
                continue;
            };
            let kind = entry
                .file_type()
                .map_err(|source| LibraryError::io(entry.path(), source))?;
            let relative = format!("{prefix}{name}");
            if kind.is_dir() {
                stack.push((entry.path(), format!("{relative}/")));
            } else if kind.is_file() && !name.ends_with(".tmp") {
                out.push(relative);
            }
        }
    }
    out.sort();
    Ok(out)
}

fn rename(from: &Path, to: &Path) -> Result<()> {
    std::fs::rename(from, to).map_err(|source| LibraryError::io(from, source))
}

fn finish(pending: &Path, staging: &Path) {
    let _ = std::fs::remove_dir_all(staging);
    let _ = std::fs::remove_file(pending);
}

fn reset_dir(dir: &Path) -> Result<()> {
    if dir.exists() {
        std::fs::remove_dir_all(dir).map_err(|source| LibraryError::io(dir, source))?;
    }
    std::fs::create_dir_all(dir).map_err(|source| LibraryError::io(dir, source))
}

fn remove_file_if_exists(path: &Path) -> Result<()> {
    match std::fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => {
            Err(LibraryError::io(path, error))
        }
        _ => Ok(()),
    }
}

/// Creates `<parent>/<name>`, or `<name>-2`, `<name>-3`... if taken.
fn unique_dir(parent: &Path, name: &str) -> Result<PathBuf> {
    std::fs::create_dir_all(parent).map_err(|source| LibraryError::io(parent, source))?;
    let mut candidate = parent.join(name);
    let mut n = 2;
    loop {
        match std::fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                candidate = parent.join(format!("{name}-{n}"));
                n += 1;
            }
            Err(source) => return Err(LibraryError::io(&candidate, source)),
        }
    }
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

/// `YYYY-MM-DD-HHMMSS` in UTC for Unix milliseconds.
fn stamp(ms: i64) -> String {
    let secs = ms.div_euclid(1000);
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}-{:02}{:02}{:02}",
        rem / 3600,
        rem % 3600 / 60,
        rem % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamps_are_utc_civil_times() {
        assert_eq!(stamp(0), "1970-01-01-000000");
        // 2026-11-08 16:22:33 UTC.
        assert_eq!(stamp(1_794_154_953_000), "2026-11-08-162233");
        // 2000-02-29 23:59:59 UTC, a leap day.
        assert_eq!(stamp(951_868_799_000), "2000-02-29-235959");
    }

    #[test]
    fn suffixes_are_appended_to_the_whole_name() {
        assert_eq!(
            with_suffix(Path::new("/a/b.kireibackup"), ".partial"),
            PathBuf::from("/a/b.kireibackup.partial")
        );
    }
}
