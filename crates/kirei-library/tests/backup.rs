// Test helpers outside #[test] fns may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use common::cbz;
use kirei_core::{DataMode, DataPaths};
use kirei_library::{
    BackupManifest, BackupOptions, Library, LibraryError, SCHEMA_VERSION, apply_pending_restore,
    inspect_backup, stage_restore,
};
use serde_json::json;

const TEAL: [u8; 3] = [30, 150, 160];
const ORANGE: [u8; 3] = [230, 110, 30];

struct Fixture {
    dir: tempfile::TempDir,
    paths: DataPaths,
}

impl Fixture {
    fn open(&self) -> Library {
        Library::open(&self.paths.database(), &self.paths.covers()).unwrap()
    }

    fn backup_path(&self) -> PathBuf {
        self.dir.path().join("library.kireibackup")
    }
}

/// A scanned library with two series, progress on one chapter and settings
/// on one series.
fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let manga = dir.path().join("Manga");
    cbz(&manga.join("Moonlit").join("Ch.001.cbz"), 4, TEAL, None);
    cbz(&manga.join("Moonlit").join("Ch.002.cbz"), 4, TEAL, None);
    cbz(&manga.join("Ember").join("Ch.001.cbz"), 3, ORANGE, None);
    let paths = DataPaths::new(DataMode::Portable, dir.path().join("data"));
    let fixture = Fixture { dir, paths };

    let library = fixture.open();
    library.add_root(&manga).unwrap();
    library.scan(None, &|_| {}).unwrap();
    let moonlit = series_id(&library, "Moonlit");
    let first = library.series_detail(moonlit).unwrap().unwrap().chapters[0].id;
    library.record_progress(first, 2).unwrap();
    library
        .set_series_settings(moonlit, &json!({ "mode": "rtl", "brightness": 0.8 }))
        .unwrap();
    library
        .set_setting("appearance.glass", json!(false))
        .unwrap();
    fixture
}

fn series_id(library: &Library, title: &str) -> i64 {
    library
        .series()
        .unwrap()
        .into_iter()
        .find(|s| s.title == title)
        .unwrap()
        .id
}

/// App settings, then titles, progress pages and series settings: what a
/// restore has to bring back.
fn state(library: &Library) -> (serde_json::Value, Vec<SeriesState>) {
    let settings = serde_json::to_value(library.settings().unwrap()).unwrap();
    let series = library
        .series()
        .unwrap()
        .into_iter()
        .map(|s| {
            let detail = library.series_detail(s.id).unwrap().unwrap();
            let pages = detail
                .chapters
                .iter()
                .map(|c| c.progress.as_ref().map(|p| p.page))
                .collect();
            (s.title, pages, library.series_settings(s.id).unwrap())
        })
        .collect();
    (settings, series)
}

type SeriesState = (String, Vec<Option<i64>>, Option<serde_json::Value>);

fn options(include_covers: bool) -> BackupOptions {
    BackupOptions {
        app_version: "0.3.0".to_owned(),
        include_covers,
    }
}

fn entry_names(path: &Path) -> Vec<String> {
    let zip = zip::ZipArchive::new(std::fs::File::open(path).unwrap()).unwrap();
    zip.file_names().map(|n| n.unwrap().into_owned()).collect()
}

/// Rewrites a backup with its manifest passed through `edit`.
fn rewrite_manifest(path: &Path, edit: impl Fn(&mut BackupManifest)) {
    let mut source = zip::ZipArchive::new(std::fs::File::open(path).unwrap()).unwrap();
    let mut entries = Vec::new();
    for index in 0..source.len() {
        let mut entry = source.by_index(index).unwrap();
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).unwrap();
        entries.push((entry.name().unwrap().into_owned(), bytes));
    }
    let out = path.with_extension("edited");
    let mut zip = zip::ZipWriter::new(std::fs::File::create(&out).unwrap());
    for (name, mut bytes) in entries {
        if name == "manifest.json" {
            let mut manifest: BackupManifest = serde_json::from_slice(&bytes).unwrap();
            edit(&mut manifest);
            bytes = serde_json::to_vec(&manifest).unwrap();
        }
        zip.start_file(name, zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&bytes).unwrap();
    }
    zip.finish().unwrap();
    std::fs::rename(out, path).unwrap();
}

#[test]
fn a_backup_restores_the_library_it_was_made_from() {
    let fx = fixture();
    let library = fx.open();
    let before = state(&library);

    let manifest = library
        .create_backup(&fx.backup_path(), &options(true))
        .unwrap();
    assert_eq!(manifest.schema_version, SCHEMA_VERSION);
    assert!(manifest.includes_covers);
    assert_eq!(manifest.cover_count, 2);
    let names = entry_names(&fx.backup_path());
    assert!(names.contains(&"manifest.json".to_owned()));
    assert!(names.contains(&"library.sqlite3".to_owned()));
    assert_eq!(names.iter().filter(|n| n.starts_with("covers/")).count(), 2);
    assert!(!fx.dir.path().join("library.kireibackup.partial").exists());

    // Change everything after the backup: forget a root, lose the covers.
    let moonlit = series_id(&library, "Moonlit");
    library
        .set_series_settings(moonlit, &json!({ "mode": "webtoon" }))
        .unwrap();
    library
        .set_setting("appearance.glass", json!(true))
        .unwrap();
    let root = library.roots().unwrap()[0].id;
    library.remove_root(root).unwrap();
    assert!(library.series().unwrap().is_empty());
    drop(library);
    std::fs::remove_dir_all(fx.paths.covers()).unwrap();

    let staged = stage_restore(&fx.backup_path(), &fx.paths).unwrap();
    assert_eq!(staged, manifest);
    assert!(fx.paths.restore_pending().is_file());

    let outcome = apply_pending_restore(&fx.paths).unwrap().unwrap();
    assert_eq!(outcome.manifest, manifest);
    assert!(!fx.paths.restore_pending().exists());
    assert!(!fx.paths.restore_staging().exists());

    let library = fx.open();
    assert_eq!(state(&library), before);
    assert!(!library.settings().unwrap().glass);
    for series in library.series().unwrap() {
        let cover = series.cover.unwrap();
        assert!(Path::new(&cover.path).is_file(), "{}", cover.path);
    }

    // The replaced data was kept aside, dated, not deleted.
    let aside = &outcome.previous_data;
    assert!(aside.starts_with(fx.paths.backups()));
    let name = aside.file_name().unwrap().to_str().unwrap();
    assert!(name.starts_with("pre-restore-"), "{name}");
    assert!(aside.join("library.sqlite3").is_file());
    let old = Library::open(&aside.join("library.sqlite3"), &aside.join("covers")).unwrap();
    assert!(old.series().unwrap().is_empty());

    // Nothing else pending: a second launch does nothing.
    assert!(apply_pending_restore(&fx.paths).unwrap().is_none());
}

#[test]
fn covers_are_left_out_unless_asked_for_and_the_cache_stays() {
    let fx = fixture();
    let library = fx.open();
    let manifest = library
        .create_backup(&fx.backup_path(), &options(false))
        .unwrap();
    assert!(!manifest.includes_covers);
    assert_eq!(manifest.cover_count, 0);
    assert!(
        !entry_names(&fx.backup_path())
            .iter()
            .any(|n| n.starts_with("covers/"))
    );
    let covers_before = common::snapshot(&fx.paths.covers());
    drop(library);

    stage_restore(&fx.backup_path(), &fx.paths).unwrap();
    let outcome = apply_pending_restore(&fx.paths).unwrap().unwrap();
    assert!(!outcome.previous_data.join("covers").exists());
    assert_eq!(common::snapshot(&fx.paths.covers()), covers_before);
}

#[test]
fn inspecting_a_backup_is_a_dry_run() {
    let fx = fixture();
    let library = fx.open();
    let manifest = library
        .create_backup(&fx.backup_path(), &options(true))
        .unwrap();
    let scratch = fx.dir.path().join("scratch");
    assert_eq!(
        inspect_backup(&fx.backup_path(), &scratch).unwrap(),
        manifest
    );
    assert!(!scratch.exists());
    assert!(!fx.paths.restore_pending().exists());
    assert!(!fx.paths.restore_staging().exists());
}

#[test]
fn a_backup_from_a_newer_schema_is_refused() {
    let fx = fixture();
    fx.open()
        .create_backup(&fx.backup_path(), &options(false))
        .unwrap();
    rewrite_manifest(&fx.backup_path(), |m| m.schema_version = SCHEMA_VERSION + 1);

    let error = stage_restore(&fx.backup_path(), &fx.paths).unwrap_err();
    assert!(
        matches!(error, LibraryError::NewerBackup { found, .. } if found == SCHEMA_VERSION + 1),
        "{error}"
    );
    assert!(error.to_string().contains("newer KireiManga"), "{error}");
    assert!(!fx.paths.restore_pending().exists());
    assert!(!fx.paths.restore_staging().exists());
}

#[test]
fn a_newer_backup_format_is_refused() {
    let fx = fixture();
    fx.open()
        .create_backup(&fx.backup_path(), &options(false))
        .unwrap();
    rewrite_manifest(&fx.backup_path(), |m| m.format += 1);
    let scratch = fx.dir.path().join("scratch");
    assert!(matches!(
        inspect_backup(&fx.backup_path(), &scratch),
        Err(LibraryError::NewerBackup { .. })
    ));
}

#[test]
fn damaged_backups_are_refused_and_the_live_data_is_untouched() {
    let fx = fixture();
    let library = fx.open();
    library
        .create_backup(&fx.backup_path(), &options(false))
        .unwrap();
    let before = state(&library);
    drop(library);
    let good = std::fs::read(fx.backup_path()).unwrap();

    // Not a ZIP at all.
    std::fs::write(fx.backup_path(), b"definitely not a backup").unwrap();
    let error = stage_restore(&fx.backup_path(), &fx.paths).unwrap_err();
    assert!(matches!(error, LibraryError::InvalidBackup(_)), "{error}");

    // Cut short.
    std::fs::write(fx.backup_path(), &good[..good.len() / 2]).unwrap();
    assert!(matches!(
        stage_restore(&fx.backup_path(), &fx.paths),
        Err(LibraryError::InvalidBackup(_))
    ));

    // A database that does not match its manifest.
    std::fs::write(fx.backup_path(), &good).unwrap();
    rewrite_manifest(&fx.backup_path(), |m| m.database_blake3 = "0".repeat(64));
    let error = stage_restore(&fx.backup_path(), &fx.paths).unwrap_err();
    assert!(error.to_string().contains("does not match"), "{error}");

    // A ZIP without a manifest.
    let mut zip = zip::ZipWriter::new(std::fs::File::create(fx.backup_path()).unwrap());
    zip.start_file("library.sqlite3", zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"SQLite format 3\0").unwrap();
    zip.finish().unwrap();
    let error = stage_restore(&fx.backup_path(), &fx.paths).unwrap_err();
    assert!(error.to_string().contains("no manifest"), "{error}");

    assert!(!fx.paths.restore_pending().exists());
    assert!(!fx.paths.restore_staging().exists());
    assert!(apply_pending_restore(&fx.paths).unwrap().is_none());
    assert_eq!(state(&fx.open()), before);
}

#[test]
fn a_staging_folder_without_its_marker_is_discarded() {
    let fx = fixture();
    let library = fx.open();
    let before = state(&library);
    drop(library);
    std::fs::create_dir_all(fx.paths.restore_staging()).unwrap();
    std::fs::write(
        fx.paths.restore_staging().join("library.sqlite3"),
        b"half written",
    )
    .unwrap();
    assert!(apply_pending_restore(&fx.paths).unwrap().is_none());
    assert!(!fx.paths.restore_staging().exists());
    assert_eq!(state(&fx.open()), before);
}
