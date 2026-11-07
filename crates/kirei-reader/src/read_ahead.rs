use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use kirei_archive::PageSource;

use crate::cache::{CachedPage, PageCache, PageKey, SourceId};
use crate::metrics::{LatencyLog, LatencySummary};
use crate::render::{self, Outcome, RenderSettings};

/// How long `page()` waits for a worker already rendering the same page
/// before rendering it itself.
const JOIN_TIMEOUT: Duration = Duration::from_secs(5);

/// Reading direction, which decides where the read-ahead window extends.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Direction {
    /// Towards higher page indexes.
    Forward,
    /// Towards lower page indexes (for example after paging back).
    Backward,
}

/// How far around the current page to read, and with how many threads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReadAheadConfig {
    /// Pages to read ahead in the reading direction.
    pub ahead: usize,
    /// Pages to keep warm behind the current page.
    pub behind: usize,
    /// Worker threads. Pages render in parallel, one per worker.
    pub workers: usize,
}

impl Default for ReadAheadConfig {
    fn default() -> Self {
        Self {
            ahead: 4,
            behind: 1,
            workers: 2,
        }
    }
}

/// Counters and timings for tuning and for the debug panel.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ReaderStats {
    /// `page()` calls answered from the cache.
    pub hits: u64,
    /// `page()` calls that rendered the page themselves.
    pub misses: u64,
    /// `page()` calls that waited for a worker already rendering the page.
    pub joined: u64,
    /// Pages the workers rendered ahead and cached.
    pub prefetched: u64,
    /// Queued jobs thrown away because the reader moved on before they ran.
    pub dropped_stale: u64,
    /// Running jobs stopped part way because their page left the window.
    pub cancelled: u64,
    /// Reads that failed (corrupt entry, missing file).
    pub errors: u64,
    /// Renders that downscaled the page.
    pub downscaled: u64,
    /// Renders that served the original bytes because they already fit.
    pub original: u64,
    /// Pages that needed a downscale but could not be decoded, served as is.
    pub decode_fallbacks: u64,
    /// Time `page()` took, hit or miss: the page turn latency the webview sees.
    pub serve: LatencySummary,
    /// Time from archive read to rendered page, on workers and on `page()`.
    pub render: LatencySummary,
}

#[derive(Default)]
struct Counters {
    hits: AtomicU64,
    misses: AtomicU64,
    joined: AtomicU64,
    prefetched: AtomicU64,
    dropped_stale: AtomicU64,
    cancelled: AtomicU64,
    errors: AtomicU64,
    downscaled: AtomicU64,
    original: AtomicU64,
    decode_fallbacks: AtomicU64,
}

fn bump(counter: &AtomicU64, by: u64) {
    counter.fetch_add(by, Ordering::Relaxed);
}

struct Job {
    generation: u64,
    key: PageKey,
    source: Arc<dyn PageSource>,
}

/// The last `focus()` call, replayed when the render settings change.
#[derive(Clone)]
struct Focus {
    id: SourceId,
    source: Arc<dyn PageSource>,
    current: usize,
    direction: Direction,
}

#[derive(Default)]
struct Queue {
    generation: u64,
    jobs: VecDeque<Job>,
    /// Pages being rendered right now, by a worker or by `page()`.
    in_flight: HashSet<PageKey>,
    /// The window of the latest focus. A running job whose page is not in it
    /// is stopped at the next checkpoint.
    wanted: HashSet<PageKey>,
    settings: RenderSettings,
    revision: u64,
    last_focus: Option<Focus>,
    shutdown: bool,
}

struct Shared {
    queue: Mutex<Queue>,
    /// Signalled when work is queued or on shutdown.
    work: Condvar,
    /// Signalled when a page stops being in flight.
    done: Condvar,
    cache: Arc<PageCache>,
    counters: Counters,
    serve: LatencyLog,
    render: LatencyLog,
}

impl Shared {
    // Queue bookkeeping is a few field writes with no partial state a panic
    // could leave behind, so a poisoned lock is still consistent.
    fn lock(&self) -> MutexGuard<'_, Queue> {
        self.queue.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Reads and renders one page, caches it when its revision is still the
    /// current one, and returns it. `None` when `cancelled` stopped it.
    fn render(
        &self,
        key: PageKey,
        source: &dyn PageSource,
        settings: &RenderSettings,
        cancelled: &dyn Fn() -> bool,
    ) -> Option<kirei_archive::Result<CachedPage>> {
        let start = Instant::now();
        let raw = match source.read_page(key.index) {
            Ok(raw) => raw,
            Err(error) => {
                bump(&self.counters.errors, 1);
                return Some(Err(error));
            }
        };
        let info = source.pages().get(key.index)?;
        let (page, outcome) = render::render(raw, info, settings, key.revision, cancelled)?;
        self.render.record(start.elapsed());
        let counter = match outcome {
            Outcome::Downscaled => &self.counters.downscaled,
            Outcome::Original => &self.counters.original,
            Outcome::Fallback => &self.counters.decode_fallbacks,
        };
        bump(counter, 1);
        let page = Arc::new(page);
        // Checked under the queue lock so a settings change cannot slip in
        // between the check and the insert. Lock order is queue, then cache.
        let queue = self.lock();
        if queue.revision == key.revision {
            self.cache.insert(key, Arc::clone(&page));
        }
        drop(queue);
        Some(Ok(page))
    }
}

/// Marks a page as in flight until dropped, then wakes anyone waiting for it.
struct InFlight<'a> {
    shared: &'a Shared,
    key: PageKey,
}

impl Drop for InFlight<'_> {
    fn drop(&mut self) {
        self.shared.lock().in_flight.remove(&self.key);
        self.shared.done.notify_all();
    }
}

/// Serves rendered pages through a [`PageCache`] and keeps the pages around
/// the current one warm with background renders.
pub struct Reader {
    shared: Arc<Shared>,
    config: ReadAheadConfig,
    workers: Vec<JoinHandle<()>>,
}

impl Reader {
    pub fn new(cache: Arc<PageCache>, config: ReadAheadConfig) -> Self {
        let shared = Arc::new(Shared {
            queue: Mutex::new(Queue::default()),
            work: Condvar::new(),
            done: Condvar::new(),
            cache,
            counters: Counters::default(),
            serve: LatencyLog::default(),
            render: LatencyLog::default(),
        });
        let workers = (0..config.workers.max(1))
            .filter_map(|n| {
                let shared = Arc::clone(&shared);
                std::thread::Builder::new()
                    .name(format!("kirei-read-ahead-{n}"))
                    .spawn(move || worker(&shared))
                    .ok()
            })
            .collect();
        Self {
            shared,
            config,
            workers,
        }
    }

    pub fn cache(&self) -> &Arc<PageCache> {
        &self.shared.cache
    }

    /// The current render settings and their revision.
    pub fn render_settings(&self) -> (RenderSettings, u64) {
        let queue = self.shared.lock();
        (queue.settings, queue.revision)
    }

    /// Changes the render settings and returns the revision pages are now
    /// rendered under. A change that leaves the settings equal keeps the
    /// revision and the cache. A real change drops every page rendered under
    /// the old settings and every queued job, then re-queues the last focus.
    pub fn update_render_settings(&self, change: impl FnOnce(&mut RenderSettings)) -> u64 {
        let mut queue = self.shared.lock();
        let mut settings = queue.settings;
        change(&mut settings);
        if settings == queue.settings {
            return queue.revision;
        }
        queue.settings = settings;
        queue.revision += 1;
        queue.generation += 1;
        let dropped = queue.jobs.len() as u64;
        queue.jobs.clear();
        queue.wanted.clear();
        let revision = queue.revision;
        let focus = queue.last_focus.clone();
        drop(queue);
        bump(&self.shared.counters.dropped_stale, dropped);
        self.shared.cache.retain_revision(revision);
        if let Some(focus) = focus {
            self.focus(focus.id, &focus.source, focus.current, focus.direction);
        }
        revision
    }

    /// Returns a rendered page, from the cache when possible. When a worker
    /// is rendering it right now this waits for that render instead of
    /// starting a second one; otherwise it renders on the calling thread.
    /// Call it off the UI thread.
    pub fn page(
        &self,
        id: SourceId,
        source: &Arc<dyn PageSource>,
        index: usize,
    ) -> kirei_archive::Result<CachedPage> {
        let start = Instant::now();
        let shared = &*self.shared;
        let counters = &shared.counters;
        let (key, settings) = {
            let queue = shared.lock();
            let key = PageKey {
                source: id,
                index,
                revision: queue.revision,
            };
            (key, queue.settings)
        };
        if let Some(page) = shared.cache.get(&key) {
            bump(&counters.hits, 1);
            shared.serve.record(start.elapsed());
            return Ok(page);
        }

        let mut queue = shared.lock();
        let mut joined = false;
        let deadline = start + JOIN_TIMEOUT;
        while queue.in_flight.contains(&key) {
            joined = true;
            let now = Instant::now();
            if now >= deadline {
                break;
            }
            queue = shared
                .done
                .wait_timeout(queue, deadline - now)
                .unwrap_or_else(PoisonError::into_inner)
                .0;
        }
        if let Some(page) = shared.cache.get(&key) {
            drop(queue);
            bump(
                if joined {
                    &counters.joined
                } else {
                    &counters.hits
                },
                1,
            );
            shared.serve.record(start.elapsed());
            return Ok(page);
        }
        queue.in_flight.insert(key);
        drop(queue);
        let guard = InFlight { shared, key };

        bump(&counters.misses, 1);
        let result = shared.render(key, source.as_ref(), &settings, &|| false);
        drop(guard);
        shared.serve.record(start.elapsed());
        result.unwrap_or_else(|| {
            Err(kirei_archive::ArchiveError::PageOutOfRange {
                index,
                len: source.len(),
            })
        })
    }

    /// Moves the read-ahead window to `current`. Jobs queued for an earlier
    /// position are dropped before the new window is queued; a render already
    /// running for a page outside the new window stops at its next checkpoint.
    ///
    /// The window stops growing once the pages in it would take more than
    /// three quarters of the cache budget, so read-ahead cannot evict the page
    /// on screen.
    pub fn focus(
        &self,
        id: SourceId,
        source: &Arc<dyn PageSource>,
        current: usize,
        direction: Direction,
    ) {
        let window = self.window(source.as_ref(), current, direction);
        let mut queue = self.shared.lock();
        queue.generation += 1;
        let dropped = queue.jobs.len() as u64;
        queue.jobs.clear();
        let generation = queue.generation;
        let revision = queue.revision;
        let keys: Vec<PageKey> = window
            .into_iter()
            .map(|index| PageKey {
                source: id,
                index,
                revision,
            })
            .collect();
        queue.wanted = keys.iter().copied().collect();
        for key in keys {
            if queue.in_flight.contains(&key) || self.shared.cache.contains(&key) {
                continue;
            }
            queue.jobs.push_back(Job {
                generation,
                key,
                source: Arc::clone(source),
            });
        }
        queue.last_focus = Some(Focus {
            id,
            source: Arc::clone(source),
            current,
            direction,
        });
        drop(queue);
        bump(&self.shared.counters.dropped_stale, dropped);
        self.shared.work.notify_all();
    }

    /// Page indexes to warm, nearest first: the current page, then `ahead`
    /// pages in the reading direction, then `behind` pages the other way.
    fn window(&self, source: &dyn PageSource, current: usize, direction: Direction) -> Vec<usize> {
        let len = source.len();
        if current >= len {
            return Vec::new();
        }
        let step = |offset: usize, forward: bool| {
            if forward {
                current.checked_add(offset).filter(|&i| i < len)
            } else {
                current.checked_sub(offset)
            }
        };
        let forward = direction == Direction::Forward;
        let mut indexes = vec![current];
        indexes.extend((1..=self.config.ahead).filter_map(|o| step(o, forward)));
        indexes.extend((1..=self.config.behind).filter_map(|o| step(o, !forward)));

        // Archive sizes are an upper bound: a downscaled page is smaller.
        let allowance = self.shared.cache.budget() / 4 * 3;
        let mut planned: u64 = 0;
        indexes
            .into_iter()
            .take_while(|&index| {
                planned += source.pages()[index].byte_len;
                planned <= allowance as u64 || index == current
            })
            .collect()
    }

    /// Drops a closed source: its queued jobs, its window and its cached pages.
    pub fn forget(&self, id: SourceId) {
        let mut queue = self.shared.lock();
        let before = queue.jobs.len();
        queue.jobs.retain(|job| job.key.source != id);
        let dropped = (before - queue.jobs.len()) as u64;
        queue.wanted.retain(|key| key.source != id);
        if queue.last_focus.as_ref().is_some_and(|f| f.id == id) {
            queue.last_focus = None;
        }
        drop(queue);
        bump(&self.shared.counters.dropped_stale, dropped);
        self.shared.cache.remove_source(id);
    }

    /// Jobs waiting for a worker.
    pub fn queued(&self) -> usize {
        self.shared.lock().jobs.len()
    }

    /// Blocks until no job is queued or running, or the timeout passes.
    /// Returns true when idle.
    pub fn wait_idle(&self, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        let mut queue = self.shared.lock();
        while !queue.jobs.is_empty() || !queue.in_flight.is_empty() {
            let now = Instant::now();
            if now >= deadline {
                return false;
            }
            queue = self
                .shared
                .done
                .wait_timeout(queue, deadline - now)
                .unwrap_or_else(PoisonError::into_inner)
                .0;
        }
        true
    }

    pub fn stats(&self) -> ReaderStats {
        let c = &self.shared.counters;
        let load = |counter: &AtomicU64| counter.load(Ordering::Relaxed);
        ReaderStats {
            hits: load(&c.hits),
            misses: load(&c.misses),
            joined: load(&c.joined),
            prefetched: load(&c.prefetched),
            dropped_stale: load(&c.dropped_stale),
            cancelled: load(&c.cancelled),
            errors: load(&c.errors),
            downscaled: load(&c.downscaled),
            original: load(&c.original),
            decode_fallbacks: load(&c.decode_fallbacks),
            serve: self.shared.serve.summary(),
            render: self.shared.render.summary(),
        }
    }
}

impl Drop for Reader {
    fn drop(&mut self) {
        self.shared.lock().shutdown = true;
        self.shared.work.notify_all();
        for handle in self.workers.drain(..) {
            let _ = handle.join();
        }
    }
}

fn worker(shared: &Shared) {
    loop {
        let (job, settings) = {
            let mut queue = shared.lock();
            loop {
                if queue.shutdown {
                    return;
                }
                if let Some(job) = queue.jobs.pop_front() {
                    if job.generation != queue.generation {
                        bump(&shared.counters.dropped_stale, 1);
                        continue;
                    }
                    // `page()` got there first; it caches the result.
                    if !queue.in_flight.insert(job.key) {
                        continue;
                    }
                    break (job, queue.settings);
                }
                queue = shared
                    .work
                    .wait(queue)
                    .unwrap_or_else(PoisonError::into_inner);
            }
        };
        let guard = InFlight {
            shared,
            key: job.key,
        };
        if !shared.cache.contains(&job.key) {
            let cancelled = || !shared.lock().wanted.contains(&job.key);
            match shared.render(job.key, job.source.as_ref(), &settings, &cancelled) {
                Some(Ok(_)) => bump(&shared.counters.prefetched, 1),
                Some(Err(_)) => {}
                None => bump(&shared.counters.cancelled, 1),
            }
        }
        drop(guard);
    }
}
