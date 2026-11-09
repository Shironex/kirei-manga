//! Watches every library root and rescans what changed.
//!
//! One `notify` watcher per root feeds a single worker thread. The worker
//! maps each changed path to the series folder (or the loose archives) it
//! belongs to and collects them per root. A root is rescanned once its
//! changes have been quiet for [`WatchConfig::debounce`], or after
//! [`WatchConfig::max_wait`] of steady changes, so a bulk copy causes a
//! handful of rescans, not one per file. The rescan is the normal incremental
//! scan narrowed to those entries whose chapters no longer match the database
//! ([`Library::scan_changed`]), so a notice that changed nothing the scanner
//! reads costs no scan. It reports the same progress events.
//!
//! Changes made while the app was closed are caught up once at start: every
//! root present then is compared with the database from folder listings and
//! file metadata ([`Library::catch_up`]), and only the series that differ are
//! rescanned. A root that is not there at start is caught up the same way
//! when it appears.
//!
//! While any scan runs, collected changes wait and go in one rescan after it.
//! A root that disappears (an unplugged drive, a network share going away)
//! loses its watch and its pending changes, and nothing is marked missing:
//! that stays the job of an explicit scan. When the folder is back, the watch
//! starts again and the whole root is rescanned once to catch up. Removing a
//! root from the library stops its watch on the next [`LibraryWatcher::sync`].

use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};

use crate::scanner::{ScanScope, is_archive, is_junk};
use crate::{Library, LibraryError, ScanProgress};

/// Timing of the watcher.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WatchConfig {
    /// Quiet time after the last change before a rescan.
    pub debounce: Duration,
    /// Longest a root waits during steady changes before it is rescanned
    /// anyway.
    pub max_wait: Duration,
    /// How often roots are checked for disappearing or coming back.
    pub health_interval: Duration,
}

impl Default for WatchConfig {
    fn default() -> Self {
        Self {
            debounce: Duration::from_millis(1500),
            max_wait: Duration::from_secs(20),
            health_interval: Duration::from_secs(5),
        }
    }
}

/// Receives the progress of every rescan the watcher starts.
pub type WatchProgress = Arc<dyn Fn(ScanProgress) + Send + Sync>;

enum Msg {
    Fs(i64, notify::Result<notify::Event>),
    Sync,
    Stop,
}

/// Handle to the watcher thread. Dropping it stops every watch.
pub struct LibraryWatcher {
    tx: Sender<Msg>,
    watching: Arc<Mutex<Vec<i64>>>,
    thread: Option<JoinHandle<()>>,
}

impl LibraryWatcher {
    /// Starts watching every root of `library`.
    pub fn start(library: Arc<Library>, config: WatchConfig, progress: WatchProgress) -> Self {
        let (tx, rx) = mpsc::channel();
        let watching = Arc::new(Mutex::new(Vec::new()));
        let mut worker = Worker {
            library,
            config,
            progress,
            tx: tx.clone(),
            roots: HashMap::new(),
            pending: HashMap::new(),
            watching: Arc::clone(&watching),
            synced: false,
        };
        let thread = std::thread::Builder::new()
            .name("kirei-library-watcher".to_owned())
            .spawn(move || {
                worker.sync();
                let mut next_health = Instant::now() + worker.config.health_interval;
                loop {
                    let deadline = worker
                        .next_flush()
                        .map_or(next_health, |at| at.min(next_health));
                    let timeout = deadline.saturating_duration_since(Instant::now());
                    match rx.recv_timeout(timeout) {
                        Ok(Msg::Stop) | Err(RecvTimeoutError::Disconnected) => break,
                        Ok(Msg::Sync) => worker.sync(),
                        Ok(Msg::Fs(root, event)) => worker.on_event(root, event),
                        Err(RecvTimeoutError::Timeout) => {}
                    }
                    if Instant::now() >= next_health {
                        worker.health();
                        next_health = Instant::now() + worker.config.health_interval;
                    }
                    worker.flush_due();
                }
            })
            .ok();
        Self {
            tx,
            watching,
            thread,
        }
    }

    /// Re-reads the roots from the library: starts watching new ones, stops
    /// watching removed ones. Call after adding or removing a root.
    pub fn sync(&self) {
        let _ = self.tx.send(Msg::Sync);
    }

    /// Ids of the roots with a live watch, sorted. For tests and diagnostics.
    pub fn watching(&self) -> Vec<i64> {
        self.watching
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl Drop for LibraryWatcher {
    fn drop(&mut self) {
        let _ = self.tx.send(Msg::Stop);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

struct RootWatch {
    path: PathBuf,
    watcher: Option<RecommendedWatcher>,
    /// Set once the root was watched and then lost, so its return triggers a
    /// catch-up rescan.
    lost: bool,
    /// Set for the roots known at start until their first watch begins, so
    /// changes made while the app was closed are caught up.
    launch: bool,
}

#[derive(Default)]
struct Pending {
    full: bool,
    /// Compare the whole root with the database and rescan what differs.
    catch_up: bool,
    scope: ScanScope,
    first: Option<Instant>,
    last: Option<Instant>,
}

struct Worker {
    library: Arc<Library>,
    config: WatchConfig,
    progress: WatchProgress,
    tx: Sender<Msg>,
    roots: HashMap<i64, RootWatch>,
    pending: HashMap<i64, Pending>,
    watching: Arc<Mutex<Vec<i64>>>,
    /// False until the first sync, which reads the roots known at start.
    synced: bool,
}

impl Worker {
    fn sync(&mut self) {
        let roots = match self.library.roots() {
            Ok(roots) => roots,
            Err(error) => {
                eprintln!("KireiManga watcher cannot list roots: {error}");
                return;
            }
        };
        self.roots
            .retain(|id, _| roots.iter().any(|root| root.id == *id));
        self.pending.retain(|id, _| self.roots.contains_key(id));
        // Roots added later are scanned by whoever added them.
        let launch = !self.synced;
        self.synced = true;
        for root in roots {
            self.roots.entry(root.id).or_insert_with(|| RootWatch {
                path: PathBuf::from(&root.path),
                watcher: None,
                lost: false,
                launch,
            });
        }
        self.health();
    }

    /// Drops the watch of roots that are gone and starts it for roots that
    /// are present (again).
    fn health(&mut self) {
        let now = Instant::now();
        for (id, root) in &mut self.roots {
            let present = root.path.is_dir();
            if root.watcher.is_some() && !present {
                root.watcher = None;
                root.lost = true;
                self.pending.remove(id);
            } else if root.watcher.is_none() && present {
                root.watcher = watch(&self.tx, *id, &root.path);
                if root.watcher.is_some() && (root.lost || root.launch) {
                    let pending = self.pending.entry(*id).or_default();
                    if root.lost {
                        pending.full = true;
                    } else {
                        pending.catch_up = true;
                    }
                    root.lost = false;
                    root.launch = false;
                    pending.first.get_or_insert(now);
                    pending.last = Some(now);
                }
            }
        }
        let mut live: Vec<i64> = self
            .roots
            .iter()
            .filter(|(_, root)| root.watcher.is_some())
            .map(|(id, _)| *id)
            .collect();
        live.sort_unstable();
        *self.watching.lock().unwrap_or_else(PoisonError::into_inner) = live;
    }

    fn on_event(&mut self, id: i64, event: notify::Result<notify::Event>) {
        let Some(root) = self.roots.get_mut(&id) else {
            return;
        };
        let event = match event {
            Ok(event) => event,
            Err(_) => {
                // The watch broke (on Windows this is how a vanished root
                // shows up). The health check restarts it when it can.
                root.watcher = None;
                root.lost = true;
                return;
            }
        };
        if matches!(event.kind, EventKind::Access(_)) {
            return;
        }
        let now = Instant::now();
        let mut touched = false;
        let mut full = false;
        let mut scope = ScanScope::default();
        for path in &event.paths {
            match classify(&root.path, path) {
                Change::Root => full = true,
                Change::SeriesDir(name) => {
                    scope.series_dirs.insert(name);
                }
                Change::Loose => scope.loose = true,
                Change::Ignored => continue,
            }
            touched = true;
        }
        if !touched {
            return;
        }
        let pending = self.pending.entry(id).or_default();
        pending.full |= full;
        pending.scope.loose |= scope.loose;
        pending.scope.series_dirs.extend(scope.series_dirs);
        pending.first.get_or_insert(now);
        pending.last = Some(now);
    }

    /// When the earliest pending root is due.
    fn next_flush(&self) -> Option<Instant> {
        self.pending
            .values()
            .filter_map(|p| Some(self.due_at(p.first?, p.last?)))
            .min()
    }

    fn due_at(&self, first: Instant, last: Instant) -> Instant {
        (last + self.config.debounce).min(first + self.config.max_wait)
    }

    fn flush_due(&mut self) {
        let now = Instant::now();
        let due: Vec<i64> = self
            .pending
            .iter()
            .filter(|(_, p)| match (p.first, p.last) {
                (Some(first), Some(last)) => self.due_at(first, last) <= now,
                _ => false,
            })
            .map(|(id, _)| *id)
            .collect();
        for id in due {
            // A scan is running: keep the changes and try again shortly.
            if self.library.is_scanning() {
                self.postpone(id, now);
                continue;
            }
            let Some(pending) = self.pending.remove(&id) else {
                continue;
            };
            let Some(root) = self.roots.get(&id) else {
                continue;
            };
            if !root.path.is_dir() {
                // Gone: the health check takes it from here.
                continue;
            }
            let progress = Arc::clone(&self.progress);
            let sink = move |p: ScanProgress| progress(p);
            // A catch-up compares the whole root, so it covers any live
            // changes collected since. Live changes are checked against the
            // database first and only what differs is rescanned.
            let result = if pending.full {
                self.library.scan(Some(id), &sink).map(|_| ())
            } else if pending.catch_up {
                self.library.catch_up(id, &sink).map(|_| ())
            } else {
                self.library
                    .scan_changed(id, Some(&pending.scope), &sink)
                    .map(|_| ())
            };
            match result {
                Ok(()) => {}
                Err(LibraryError::ScanInProgress) => {
                    self.pending.insert(id, pending);
                    self.postpone(id, Instant::now());
                }
                Err(error) => eprintln!("KireiManga watcher rescan failed: {error}"),
            }
        }
    }

    /// Pushes a due root back by one debounce period.
    fn postpone(&mut self, id: i64, now: Instant) {
        if let Some(pending) = self.pending.get_mut(&id) {
            pending.first = Some(now);
            pending.last = Some(now);
        }
    }
}

fn watch(tx: &Sender<Msg>, id: i64, path: &Path) -> Option<RecommendedWatcher> {
    let tx = tx.clone();
    let mut watcher = notify::recommended_watcher(move |event| {
        let _ = tx.send(Msg::Fs(id, event));
    })
    .ok()?;
    watcher.watch(path, RecursiveMode::Recursive).ok()?;
    Some(watcher)
}

#[derive(Debug, PartialEq, Eq)]
enum Change {
    /// The root folder itself.
    Root,
    /// Something inside the series folder with this name.
    SeriesDir(String),
    /// An archive directly in the root.
    Loose,
    /// Outside the root, hidden or junk.
    Ignored,
}

/// Maps a changed path to the part of the root it affects.
fn classify(root: &Path, path: &Path) -> Change {
    let Ok(relative) = path.strip_prefix(root) else {
        return Change::Ignored;
    };
    let mut names = Vec::new();
    for component in relative.components() {
        match component {
            Component::Normal(name) => match name.to_str() {
                Some(name) if !is_junk(name) => names.push(name),
                _ => return Change::Ignored,
            },
            _ => return Change::Ignored,
        }
    }
    match names.as_slice() {
        [] => Change::Root,
        [name] if is_archive(name) && !path.is_dir() => Change::Loose,
        // A created or removed folder directly in the root. A removed plain
        // file lands here too; scanning a series folder that is not there
        // only marks its known chapters missing, which is right for both.
        [name] if path.is_dir() || !path.exists() => Change::SeriesDir((*name).to_owned()),
        // Any other file directly in the root (an image, a text file) is not
        // something the scanner reads.
        [_] => Change::Ignored,
        [first, ..] => Change::SeriesDir((*first).to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_handle_can_be_shared_state() {
        fn is_send_sync<T: Send + Sync>() {}
        is_send_sync::<LibraryWatcher>();
    }

    #[test]
    fn changes_map_to_the_series_they_belong_to() {
        let root = Path::new("/manga");
        assert_eq!(classify(root, Path::new("/manga")), Change::Root);
        assert_eq!(
            classify(root, Path::new("/manga/Moonlit/Vol 1/Ch.001.cbz")),
            Change::SeriesDir("Moonlit".to_owned())
        );
        assert_eq!(
            classify(root, Path::new("/manga/Title - 012.cbz")),
            Change::Loose
        );
        // A folder that no longer exists is treated as a series folder.
        assert_eq!(
            classify(root, Path::new("/manga/Gone Series")),
            Change::SeriesDir("Gone Series".to_owned())
        );
        assert_eq!(
            classify(root, Path::new("/manga/Moonlit/.DS_Store")),
            Change::Ignored
        );
        assert_eq!(
            classify(root, Path::new("/manga/.hidden/Ch.001.cbz")),
            Change::Ignored
        );
        assert_eq!(
            classify(root, Path::new("/elsewhere/x.cbz")),
            Change::Ignored
        );
    }
}
