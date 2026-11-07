use std::collections::VecDeque;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

use kirei_archive::PageSource;

use crate::cache::{PageBytes, PageCache, PageKey, SourceId};

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
    /// Worker threads. Reads of different pages run in parallel.
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

/// Counters for tuning and for the debug panel.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ReaderStats {
    /// `page()` calls answered from the cache.
    pub hits: u64,
    /// `page()` calls that had to read the source.
    pub misses: u64,
    /// Pages the workers read ahead and cached.
    pub prefetched: u64,
    /// Queued jobs thrown away because the reader moved on before they ran.
    pub dropped_stale: u64,
    /// Reads that failed (corrupt entry, missing file).
    pub errors: u64,
}

#[derive(Default)]
struct Counters {
    hits: AtomicU64,
    misses: AtomicU64,
    prefetched: AtomicU64,
    dropped_stale: AtomicU64,
    errors: AtomicU64,
}

struct Job {
    generation: u64,
    key: PageKey,
    source: Arc<dyn PageSource>,
}

#[derive(Default)]
struct Queue {
    generation: u64,
    jobs: VecDeque<Job>,
    in_flight: usize,
    shutdown: bool,
}

struct Shared {
    queue: Mutex<Queue>,
    /// Signalled when work is queued or on shutdown.
    work: Condvar,
    /// Signalled when a worker finishes a job.
    done: Condvar,
    cache: Arc<PageCache>,
    counters: Counters,
}

impl Shared {
    // Queue bookkeeping is a few field writes with no partial state a panic
    // could leave behind, so a poisoned lock is still consistent.
    fn lock(&self) -> MutexGuard<'_, Queue> {
        self.queue.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

/// Serves pages through a [`PageCache`] and keeps the pages around the current
/// one warm with background reads.
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

    /// Returns a page, from the cache when possible, otherwise read on the
    /// calling thread and cached. Call it off the UI thread.
    pub fn page(
        &self,
        id: SourceId,
        source: &Arc<dyn PageSource>,
        index: usize,
    ) -> kirei_archive::Result<PageBytes> {
        let key = PageKey { source: id, index };
        let counters = &self.shared.counters;
        if let Some(bytes) = self.shared.cache.get(&key) {
            counters.hits.fetch_add(1, Ordering::Relaxed);
            return Ok(bytes);
        }
        counters.misses.fetch_add(1, Ordering::Relaxed);
        let bytes: PageBytes = source.read_page(index)?.into();
        self.shared.cache.insert(key, Arc::clone(&bytes));
        Ok(bytes)
    }

    /// Moves the read-ahead window to `current`. Jobs queued for an earlier
    /// position are dropped before the new window is queued; a read already
    /// running finishes and is cached.
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
        self.shared
            .counters
            .dropped_stale
            .fetch_add(dropped, Ordering::Relaxed);
        let generation = queue.generation;
        for index in window {
            let key = PageKey { source: id, index };
            if self.shared.cache.contains(&key) {
                continue;
            }
            queue.jobs.push_back(Job {
                generation,
                key,
                source: Arc::clone(source),
            });
        }
        drop(queue);
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

    /// Drops a closed source: its queued jobs and its cached pages.
    pub fn forget(&self, id: SourceId) {
        let mut queue = self.shared.lock();
        let before = queue.jobs.len();
        queue.jobs.retain(|job| job.key.source != id);
        let dropped = (before - queue.jobs.len()) as u64;
        drop(queue);
        self.shared
            .counters
            .dropped_stale
            .fetch_add(dropped, Ordering::Relaxed);
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
        while !queue.jobs.is_empty() || queue.in_flight > 0 {
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
        ReaderStats {
            hits: c.hits.load(Ordering::Relaxed),
            misses: c.misses.load(Ordering::Relaxed),
            prefetched: c.prefetched.load(Ordering::Relaxed),
            dropped_stale: c.dropped_stale.load(Ordering::Relaxed),
            errors: c.errors.load(Ordering::Relaxed),
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
        let job = {
            let mut queue = shared.lock();
            loop {
                if queue.shutdown {
                    return;
                }
                if let Some(job) = queue.jobs.pop_front() {
                    if job.generation == queue.generation {
                        queue.in_flight += 1;
                        break job;
                    }
                    shared
                        .counters
                        .dropped_stale
                        .fetch_add(1, Ordering::Relaxed);
                    continue;
                }
                queue = shared
                    .work
                    .wait(queue)
                    .unwrap_or_else(PoisonError::into_inner);
            }
        };

        if !shared.cache.contains(&job.key) {
            match job.source.read_page(job.key.index) {
                Ok(bytes) => {
                    shared.cache.insert(job.key, bytes.into());
                    shared.counters.prefetched.fetch_add(1, Ordering::Relaxed);
                }
                Err(_) => {
                    shared.counters.errors.fetch_add(1, Ordering::Relaxed);
                }
            }
        }

        shared.lock().in_flight -= 1;
        shared.done.notify_all();
    }
}
