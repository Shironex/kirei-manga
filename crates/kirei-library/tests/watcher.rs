// Test helpers outside #[test] fns may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use common::cbz;
use kirei_library::{Library, LibraryWatcher, ScanPhase, ScanProgress, ScanScope, WatchConfig};

const TEAL: [u8; 3] = [30, 150, 160];
const ORANGE: [u8; 3] = [230, 110, 30];
/// Long enough for FSEvents and ReadDirectoryChangesW on a busy CI runner.
const PATIENCE: Duration = Duration::from_secs(15);

struct Fixture {
    _dir: tempfile::TempDir,
    root: PathBuf,
    library: Arc<Library>,
}

fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Manga");
    cbz(&root.join("Moonlit").join("Ch.001.cbz"), 2, TEAL, None);
    cbz(&root.join("Ember").join("Ch.001.cbz"), 2, ORANGE, None);
    let library = Library::open(
        &dir.path().join("library.sqlite3"),
        &dir.path().join("covers"),
    )
    .unwrap();
    let added = library.add_root(&root).unwrap();
    library.scan(None, &|_| {}).unwrap();
    Fixture {
        _dir: dir,
        root: PathBuf::from(added.path),
        library: Arc::new(library),
    }
}

fn config() -> WatchConfig {
    WatchConfig {
        debounce: Duration::from_millis(400),
        max_wait: Duration::from_secs(5),
        health_interval: Duration::from_millis(200),
    }
}

/// Every progress report the watcher's rescans send.
#[derive(Clone, Default)]
struct Events(Arc<Mutex<Vec<ScanProgress>>>);

impl Events {
    fn sink(&self) -> kirei_library::WatchProgress {
        let events = self.0.clone();
        Arc::new(move |p| events.lock().unwrap().push(p))
    }

    fn rescans(&self) -> usize {
        self.0
            .lock()
            .unwrap()
            .iter()
            .filter(|p| p.phase == ScanPhase::Done)
            .count()
    }
}

fn chapter_count(library: &Library, title: &str) -> usize {
    library
        .series()
        .unwrap()
        .into_iter()
        .find(|s| s.title == title)
        .map_or(0, |s| usize::try_from(s.chapter_count).unwrap())
}

fn wait_for(what: &str, mut done: impl FnMut() -> bool) {
    let start = Instant::now();
    while !done() {
        assert!(start.elapsed() < PATIENCE, "timed out waiting for {what}");
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn wait_until_watching(watcher: &LibraryWatcher, ids: &[i64]) {
    wait_for("the watch list", || watcher.watching() == ids);
    // FSEvents can drop changes made right after the stream starts.
    std::thread::sleep(Duration::from_millis(300));
}

#[test]
fn a_scoped_rescan_only_looks_at_its_series() {
    let fx = fixture();
    cbz(&fx.root.join("Moonlit").join("Ch.002.cbz"), 2, TEAL, None);
    cbz(&fx.root.join("Ember").join("Ch.002.cbz"), 2, ORANGE, None);
    std::fs::remove_file(fx.root.join("Ember").join("Ch.001.cbz")).unwrap();
    let root_id = fx.library.roots().unwrap()[0].id;

    let scope = ScanScope {
        series_dirs: ["Moonlit".to_owned()].into(),
        loose: false,
    };
    let summary = fx.library.scan_entries(root_id, &scope, &|_| {}).unwrap();
    assert_eq!(summary.series, 1);
    assert_eq!(summary.added, 1);
    assert_eq!(summary.missing, 0);
    assert_eq!(chapter_count(&fx.library, "Moonlit"), 2);
    // Ember was outside the scope: its new chapter is not picked up and its
    // deleted one is not marked missing yet.
    assert_eq!(chapter_count(&fx.library, "Ember"), 1);

    let summary = fx.library.scan(Some(root_id), &|_| {}).unwrap();
    assert_eq!(summary.missing, 1);
    assert_eq!(chapter_count(&fx.library, "Ember"), 1);
}

#[test]
fn a_new_archive_shows_up_without_a_manual_scan() {
    let fx = fixture();
    let events = Events::default();
    let root_id = fx.library.roots().unwrap()[0].id;
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    wait_until_watching(&watcher, &[root_id]);

    cbz(&fx.root.join("Moonlit").join("Ch.002.cbz"), 2, TEAL, None);
    wait_for("the new chapter", || {
        chapter_count(&fx.library, "Moonlit") == 2
    });

    // A brand new series folder and a loose archive too.
    cbz(&fx.root.join("Brand New").join("Ch.001.cbz"), 2, TEAL, None);
    cbz(&fx.root.join("Loose Title - 001.cbz"), 2, ORANGE, None);
    wait_for("the new series", || {
        chapter_count(&fx.library, "Brand New") == 1
            && chapter_count(&fx.library, "Loose Title") == 1
    });
    assert!(events.rescans() >= 1);
    let reported = events.0.lock().unwrap();
    assert!(reported.iter().any(|p| p.phase == ScanPhase::Reading));
}

#[test]
fn a_bulk_copy_is_one_rescan_not_a_storm() {
    let fx = fixture();
    let events = Events::default();
    let root_id = fx.library.roots().unwrap()[0].id;
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    wait_until_watching(&watcher, &[root_id]);

    for i in 2..=13 {
        cbz(
            &fx.root.join("Moonlit").join(format!("Ch.{i:03}.cbz")),
            1,
            TEAL,
            None,
        );
    }
    wait_for("the copied chapters", || {
        chapter_count(&fx.library, "Moonlit") == 13
    });
    std::thread::sleep(config().debounce * 2);
    let rescans = events.rescans();
    assert!((1..=2).contains(&rescans), "{rescans} rescans for 12 files");
}

#[test]
fn changes_during_a_scan_wait_for_it_to_finish() {
    let fx = fixture();
    let events = Events::default();
    let root_id = fx.library.roots().unwrap()[0].id;
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    wait_until_watching(&watcher, &[root_id]);

    // A manual scan that stops in its saving phase until released.
    let (release_tx, release_rx) = mpsc::channel::<()>();
    let (saving_tx, saving_rx) = mpsc::channel::<()>();
    let release_rx = Mutex::new(release_rx);
    let library = fx.library.clone();
    let scan = std::thread::spawn(move || {
        library
            .scan(None, &|p| {
                if p.phase == ScanPhase::Saving && p.done == 0 {
                    let _ = saving_tx.send(());
                    let _ = release_rx.lock().unwrap().recv();
                }
            })
            .unwrap()
    });
    saving_rx.recv().unwrap();
    assert!(fx.library.is_scanning());

    cbz(&fx.root.join("Ember").join("Ch.002.cbz"), 2, ORANGE, None);
    std::thread::sleep(config().debounce * 3);
    assert_eq!(events.rescans(), 0, "the watcher rescanned during a scan");

    release_tx.send(()).unwrap();
    scan.join().unwrap();
    wait_for("the deferred rescan", || {
        chapter_count(&fx.library, "Ember") == 2
    });
    assert!(events.rescans() >= 1);
}

#[test]
fn a_root_that_disappears_is_survived_and_caught_up_on_return() {
    let fx = fixture();
    let events = Events::default();
    let root_id = fx.library.roots().unwrap()[0].id;
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    wait_until_watching(&watcher, &[root_id]);

    let away = fx.root.with_file_name("Manga-unplugged");
    std::fs::rename(&fx.root, &away).unwrap();
    wait_for("the watch to drop", || watcher.watching().is_empty());
    std::thread::sleep(config().debounce * 2);
    // Nothing was marked missing just because the folder went away.
    assert!(fx.library.series().unwrap().iter().all(|s| !s.missing));

    // Changed while away, then plugged back in.
    cbz(&away.join("Moonlit").join("Ch.002.cbz"), 2, TEAL, None);
    std::fs::rename(&away, &fx.root).unwrap();
    wait_for("the watch to return", || watcher.watching() == [root_id]);
    wait_for("the catch-up rescan", || {
        chapter_count(&fx.library, "Moonlit") == 2
    });
}

#[test]
fn removing_a_root_stops_its_watch() {
    let fx = fixture();
    let events = Events::default();
    let root_id = fx.library.roots().unwrap()[0].id;
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    wait_until_watching(&watcher, &[root_id]);

    fx.library.remove_root(root_id).unwrap();
    watcher.sync();
    wait_for("the watch to stop", || watcher.watching().is_empty());

    cbz(&fx.root.join("Moonlit").join("Ch.002.cbz"), 2, TEAL, None);
    std::thread::sleep(config().debounce * 3);
    assert_eq!(events.rescans(), 0);

    // Adding a root later starts a watch for it.
    let other = fx.root.with_file_name("More Manga");
    cbz(&other.join("Later").join("Ch.001.cbz"), 2, TEAL, None);
    let added = fx.library.add_root(&other).unwrap();
    watcher.sync();
    wait_until_watching(&watcher, &[added.id]);
    drop(watcher);
    assert!(Path::new(&added.path).is_dir());
}

fn series(library: &Library, title: &str) -> kirei_library::SeriesSummary {
    library
        .series()
        .unwrap()
        .into_iter()
        .find(|s| s.title == title)
        .unwrap()
}

fn scope(dirs: &[&str], loose: bool) -> ScanScope {
    ScanScope {
        series_dirs: dirs.iter().map(|d| (*d).to_owned()).collect(),
        loose,
    }
}

#[test]
fn catching_up_rescans_only_the_series_that_changed() {
    let fx = fixture();
    cbz(&fx.root.join("Quiet").join("Ch.001.cbz"), 2, TEAL, None);
    let root_id = fx.library.roots().unwrap()[0].id;
    fx.library.scan(None, &|_| {}).unwrap();

    // Made while nothing watched: one chapter added, one deleted.
    cbz(&fx.root.join("Moonlit").join("Ch.002.cbz"), 2, TEAL, None);
    std::fs::remove_file(fx.root.join("Ember").join("Ch.001.cbz")).unwrap();
    assert_eq!(
        fx.library.changed_entries(root_id).unwrap(),
        Some(scope(&["Ember", "Moonlit"], false))
    );

    let events = Events::default();
    let sink = events.sink();
    let summary = fx
        .library
        .catch_up(root_id, &|p| sink(p))
        .unwrap()
        .expect("a catch-up scan");
    // Only Moonlit still has chapters to list (Ember's are gone); Quiet was
    // unchanged and stayed out of the scan.
    assert_eq!(summary.series, 1);
    assert_eq!(summary.unchanged, 1);
    assert_eq!(summary.added, 1);
    assert_eq!(summary.missing, 1);
    assert_eq!(chapter_count(&fx.library, "Moonlit"), 2);
    let ember = series(&fx.library, "Ember");
    assert!(ember.missing);
    assert_eq!(ember.missing_count, 1);
    assert!(!series(&fx.library, "Quiet").missing);
    assert_eq!(events.rescans(), 1, "the catch-up ends with done");

    // Caught up: nothing left to do, and no events for it.
    assert_eq!(
        fx.library.changed_entries(root_id).unwrap(),
        Some(scope(&[], false))
    );
    assert!(
        fx.library
            .catch_up(root_id, &|p| sink(p))
            .unwrap()
            .is_none()
    );
    assert_eq!(events.rescans(), 1);
}

#[test]
fn catching_up_notices_changed_returned_and_loose_chapters() {
    let fx = fixture();
    let root_id = fx.library.roots().unwrap()[0].id;
    let ember = fx.root.join("Ember").join("Ch.001.cbz");

    // A chapter rewritten with a different size.
    cbz(&fx.root.join("Moonlit").join("Ch.001.cbz"), 5, TEAL, None);
    // A new loose archive in the root.
    cbz(&fx.root.join("Loose Title - 001.cbz"), 2, ORANGE, None);
    assert_eq!(
        fx.library.changed_entries(root_id).unwrap(),
        Some(scope(&["Moonlit"], true))
    );
    fx.library.catch_up(root_id, &|_| {}).unwrap().unwrap();
    assert_eq!(chapter_count(&fx.library, "Loose Title"), 1);

    // A chapter marked missing whose file comes back.
    let away = fx.root.with_file_name("Ch.001.cbz.away");
    std::fs::rename(&ember, &away).unwrap();
    fx.library.catch_up(root_id, &|_| {}).unwrap().unwrap();
    assert!(series(&fx.library, "Ember").missing);
    std::fs::rename(&away, &ember).unwrap();
    assert_eq!(
        fx.library.changed_entries(root_id).unwrap(),
        Some(scope(&["Ember"], false))
    );
    fx.library.catch_up(root_id, &|_| {}).unwrap().unwrap();
    assert!(!series(&fx.library, "Ember").missing);

    // A whole series folder deleted.
    std::fs::remove_dir_all(fx.root.join("Moonlit")).unwrap();
    assert_eq!(
        fx.library.changed_entries(root_id).unwrap(),
        Some(scope(&["Moonlit"], false))
    );
    fx.library.catch_up(root_id, &|_| {}).unwrap().unwrap();
    assert!(series(&fx.library, "Moonlit").missing);
}

#[test]
fn catching_up_an_unreachable_root_marks_nothing_missing() {
    let fx = fixture();
    let root_id = fx.library.roots().unwrap()[0].id;
    std::fs::rename(&fx.root, fx.root.with_file_name("Manga-unplugged")).unwrap();

    assert_eq!(fx.library.changed_entries(root_id).unwrap(), None);
    let events = Events::default();
    let sink = events.sink();
    assert!(
        fx.library
            .catch_up(root_id, &|p| sink(p))
            .unwrap()
            .is_none()
    );
    assert!(events.0.lock().unwrap().is_empty());
    assert!(fx.library.series().unwrap().iter().all(|s| !s.missing));
}

#[test]
fn changes_made_while_closed_are_caught_up_at_start() {
    let fx = fixture();
    let root_id = fx.library.roots().unwrap()[0].id;
    // The app is closed: no watcher sees these.
    cbz(&fx.root.join("Moonlit").join("Ch.002.cbz"), 2, TEAL, None);
    std::fs::remove_file(fx.root.join("Ember").join("Ch.001.cbz")).unwrap();

    let events = Events::default();
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    wait_for("the launch catch-up", || {
        chapter_count(&fx.library, "Moonlit") == 2 && series(&fx.library, "Ember").missing
    });
    assert_eq!(watcher.watching(), [root_id]);
    std::thread::sleep(config().debounce * 2);
    assert_eq!(events.rescans(), 1);
}

#[test]
fn an_unchanged_library_is_not_rescanned_at_start() {
    let fx = fixture();
    let root_id = fx.library.roots().unwrap()[0].id;
    let events = Events::default();
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    wait_until_watching(&watcher, &[root_id]);
    std::thread::sleep(config().debounce * 3);
    assert!(events.0.lock().unwrap().is_empty());
}

#[test]
fn a_root_missing_at_start_is_caught_up_when_it_appears() {
    let fx = fixture();
    let root_id = fx.library.roots().unwrap()[0].id;
    let away = fx.root.with_file_name("Manga-unplugged");
    std::fs::rename(&fx.root, &away).unwrap();

    let events = Events::default();
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    std::thread::sleep(config().debounce * 3);
    assert!(watcher.watching().is_empty());
    assert_eq!(events.rescans(), 0);
    assert!(fx.library.series().unwrap().iter().all(|s| !s.missing));

    // Changed while away (a chapter deleted), then plugged in.
    std::fs::remove_file(away.join("Ember").join("Ch.001.cbz")).unwrap();
    std::fs::rename(&away, &fx.root).unwrap();
    wait_for("the watch to start", || watcher.watching() == [root_id]);
    wait_for("the catch-up", || series(&fx.library, "Ember").missing);
    assert!(!series(&fx.library, "Moonlit").missing);
}

#[test]
fn a_notice_that_changes_no_chapter_costs_no_rescan() {
    let fx = fixture();
    let root_id = fx.library.roots().unwrap()[0].id;
    let events = Events::default();
    let watcher = LibraryWatcher::start(fx.library.clone(), config(), events.sink());
    wait_until_watching(&watcher, &[root_id]);
    // Let the launch catch-up go by first, so it does not absorb the notice.
    std::thread::sleep(config().debounce * 2);

    // A file the scanner does not read, inside a series folder: the watcher
    // sees a change in Moonlit, but no chapter differs from the database.
    std::fs::write(fx.root.join("Moonlit").join("notes.txt"), b"to read").unwrap();
    std::thread::sleep(config().debounce * 3);
    assert!(events.0.lock().unwrap().is_empty());

    // A real change in the same folder still goes through.
    cbz(&fx.root.join("Moonlit").join("Ch.002.cbz"), 2, TEAL, None);
    wait_for("the new chapter", || {
        chapter_count(&fx.library, "Moonlit") == 2
    });
    assert_eq!(events.rescans(), 1);
}
