//! The download runtime: a dispatcher that keeps up to `concurrency`
//! chapters downloading, each with a few pages in flight, every page counted
//! against one shared page budget on top of the MangaDex client's own limits.
//!
//! Pausing or cancelling aborts the chapter's task. That is safe at any
//! point: a page only gets its final name once it is whole, and the archive
//! only once it is whole and synced (see `cbz.rs`), so an abort, like a
//! killed process, leaves nothing half written where the library or a resume
//! would read it.

use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use kirei_mangadex::{ImageQuality, MangaDexError, RateLimiter, RateWindow};
use tokio::sync::{Notify, watch};
use tokio::task::{AbortHandle, JoinSet};

use crate::cbz;
use crate::comic_info::comic_info_xml;
use crate::error::{DownloadError, Result};
use crate::model::{DownloadEvent, DownloadJob, JobState};
use crate::naming;
use crate::source::ChapterSource;
use crate::staging::{Staging, page_ext};
use crate::store::{Description, Store};
use crate::valid_id;

/// Told about every change to the queue; the desktop shell forwards it to
/// the renderer as an event.
pub type Listener = Arc<dyn Fn(&DownloadEvent) + Send + Sync>;

/// Retries for one page, on top of the client's own server failover.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PageRetry {
    /// Tries per page, the first one included.
    pub attempts: u32,
    /// First wait; doubles each retry.
    pub base_delay: Duration,
    pub max_delay: Duration,
}

impl Default for PageRetry {
    fn default() -> Self {
        Self {
            attempts: 3,
            base_delay: Duration::from_secs(2),
            max_delay: Duration::from_secs(30),
        }
    }
}

/// How and where the downloader works.
#[derive(Debug, Clone)]
pub struct DownloadConfig {
    /// The downloads folder, a library root (or inside one). Series folders
    /// are made directly inside it.
    pub destination: PathBuf,
    /// Where pages wait until their chapter is complete. Must be outside
    /// every library root.
    pub staging: PathBuf,
    /// Chapters downloaded at the same time.
    pub concurrency: usize,
    /// Pages in flight per chapter.
    pub pages_in_flight: usize,
    /// Page images started across all chapters. MangaDex publishes no number
    /// for MangaDex@Home; this keeps downloads polite next to reading. The
    /// API calls (chapter details, at-home servers) are paced by the client.
    pub page_rate: RateWindow,
    pub retry: PageRetry,
}

impl DownloadConfig {
    pub fn new(destination: impl Into<PathBuf>, staging: impl Into<PathBuf>) -> Self {
        Self {
            destination: destination.into(),
            staging: staging.into(),
            concurrency: 2,
            pages_in_flight: 3,
            page_rate: RateWindow::per_second(5),
            retry: PageRetry::default(),
        }
    }
}

struct Inner<S> {
    source: S,
    store: Mutex<Store>,
    destination: Mutex<PathBuf>,
    staging: PathBuf,
    concurrency: AtomicUsize,
    pages_in_flight: usize,
    retry: PageRetry,
    page_limiter: RateLimiter,
    /// Chapters running now, by job id.
    active: Mutex<HashMap<i64, AbortHandle>>,
    wake: Notify,
    /// Bumped on every change, for [`Downloader::idle`].
    changes: watch::Sender<u64>,
    listener: Option<Listener>,
}

/// The download queue and its workers. Dropping it stops every download;
/// finished pages stay staged and the queue resumes on the next start.
pub struct Downloader<S: ChapterSource> {
    inner: Arc<Inner<S>>,
    dispatcher: AbortHandle,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl<S: ChapterSource> Downloader<S> {
    /// Starts the dispatcher; queued jobs (and jobs interrupted last time)
    /// begin at once. Call from inside a tokio runtime.
    pub fn start(
        source: S,
        store: Store,
        config: DownloadConfig,
        listener: Option<Listener>,
    ) -> Self {
        let (changes, _) = watch::channel(0);
        let inner = Arc::new(Inner {
            source,
            store: Mutex::new(store),
            destination: Mutex::new(config.destination),
            staging: config.staging,
            concurrency: AtomicUsize::new(config.concurrency.max(1)),
            pages_in_flight: config.pages_in_flight.max(1),
            retry: config.retry,
            page_limiter: RateLimiter::new(config.page_rate),
            active: Mutex::new(HashMap::new()),
            wake: Notify::new(),
            changes,
            listener,
        });
        let dispatcher = tokio::spawn(dispatch(Arc::clone(&inner))).abort_handle();
        Self { inner, dispatcher }
    }

    /// Queues chapters by MangaDex id. Chapters already queued, running or
    /// downloaded are skipped; failed ones are retried. Returns the jobs
    /// added or requeued.
    pub fn enqueue(
        &self,
        chapter_ids: &[String],
        quality: ImageQuality,
        auto: bool,
    ) -> Result<Vec<DownloadJob>> {
        if let Some(bad) = chapter_ids.iter().find(|id| !valid_id(id)) {
            return Err(DownloadError::InvalidId(bad.clone()));
        }
        let jobs = self.inner.store().enqueue(chapter_ids, quality, auto)?;
        for job in &jobs {
            self.inner.emit(DownloadEvent::Changed { job: job.clone() });
        }
        self.inner.wake.notify_one();
        Ok(jobs)
    }

    /// Every job, oldest first.
    pub fn jobs(&self) -> Result<Vec<DownloadJob>> {
        self.inner.store().jobs()
    }

    /// Holds jobs (all of them when `ids` is `None`). Finished pages are
    /// kept for the resume.
    pub fn pause(&self, ids: Option<&[i64]>) -> Result<()> {
        for id in self.inner.select(ids)? {
            self.inner.stop(id);
            if self.inner.store().transition(
                id,
                &[JobState::Queued, JobState::Downloading],
                JobState::Paused,
            )? {
                self.inner.emit_job(id);
            }
        }
        self.inner.wake.notify_one();
        Ok(())
    }

    /// Queues paused and failed jobs again (all of them when `ids` is
    /// `None`). They continue from the pages already fetched.
    pub fn resume(&self, ids: Option<&[i64]>) -> Result<()> {
        for id in self.inner.select(ids)? {
            if self.inner.store().transition(
                id,
                &[JobState::Paused, JobState::Failed],
                JobState::Queued,
            )? {
                self.inner.emit_job(id);
            }
        }
        self.inner.wake.notify_one();
        Ok(())
    }

    /// Stops and forgets jobs (all of them when `ids` is `None`), deleting
    /// their staged pages. Archives already in the library stay.
    pub fn cancel(&self, ids: Option<&[i64]>) -> Result<()> {
        for id in self.inner.select(ids)? {
            self.inner.stop(id);
            let removed = self.inner.store().remove(id)?;
            if let Some(job) = removed {
                if valid_id(&job.chapter_id) {
                    Staging::new(&self.inner.staging, &job.chapter_id).remove()?;
                }
                if job.state != JobState::Done
                    && let Some(path) = &job.path
                {
                    let _ = std::fs::remove_file(cbz::temp_path(Path::new(path)));
                }
                self.inner.emit(DownloadEvent::Removed { id });
            }
        }
        self.inner.wake.notify_one();
        Ok(())
    }

    /// Removes finished jobs from the list. Returns how many went.
    pub fn clear_finished(&self) -> Result<usize> {
        let ids = self.inner.store().clear_finished()?;
        for &id in &ids {
            self.inner.emit(DownloadEvent::Removed { id });
        }
        Ok(ids.len())
    }

    /// Where new archives go. Jobs already writing keep their folder.
    pub fn set_destination(&self, destination: PathBuf) {
        *lock(&self.inner.destination) = destination;
    }

    pub fn destination(&self) -> PathBuf {
        lock(&self.inner.destination).clone()
    }

    /// Chapters downloaded at the same time. Lowering it lets running
    /// chapters finish.
    pub fn set_concurrency(&self, concurrency: usize) {
        self.inner
            .concurrency
            .store(concurrency.max(1), Ordering::Relaxed);
        self.inner.wake.notify_one();
    }

    /// Resolves once nothing is queued or running. For tests and for a
    /// clean shutdown.
    pub async fn idle(&self) {
        let mut changes = self.inner.changes.subscribe();
        loop {
            let busy = !lock(&self.inner.active).is_empty()
                || self.inner.store().has_work().unwrap_or(false);
            if !busy {
                return;
            }
            if changes.changed().await.is_err() {
                return;
            }
        }
    }

    /// Stops every download now. Finished pages stay staged; the next start
    /// resumes.
    pub fn shutdown(&self) {
        self.dispatcher.abort();
        let mut active = lock(&self.inner.active);
        for (_, task) in active.drain() {
            task.abort();
        }
    }
}

impl<S: ChapterSource> Drop for Downloader<S> {
    fn drop(&mut self) {
        self.shutdown();
    }
}

async fn dispatch<S: ChapterSource>(inner: Arc<Inner<S>>) {
    loop {
        inner.fill();
        inner.wake.notified().await;
    }
}

fn retryable(error: &MangaDexError) -> bool {
    match error {
        MangaDexError::ImageUnavailable { .. }
        | MangaDexError::Network(_)
        | MangaDexError::RateLimited { .. } => true,
        MangaDexError::Api { status, .. } => *status == 429 || *status >= 500,
        _ => false,
    }
}

impl<S: ChapterSource> Inner<S> {
    fn store(&self) -> MutexGuard<'_, Store> {
        lock(&self.store)
    }

    fn emit(&self, event: DownloadEvent) {
        if let Some(listener) = &self.listener {
            listener(&event);
        }
        self.changes.send_modify(|version| *version += 1);
    }

    fn emit_job(&self, id: i64) {
        let job = self.store().get(id).ok().flatten();
        if let Some(job) = job {
            self.emit(DownloadEvent::Changed { job });
        }
    }

    fn select(&self, ids: Option<&[i64]>) -> Result<Vec<i64>> {
        match ids {
            Some(ids) => Ok(ids.to_vec()),
            None => Ok(self.store().jobs()?.into_iter().map(|job| job.id).collect()),
        }
    }

    /// Aborts a running chapter, if it is running.
    fn stop(&self, id: i64) {
        if let Some(task) = lock(&self.active).remove(&id) {
            task.abort();
        }
    }

    /// Starts queued jobs while there is room.
    fn fill(self: &Arc<Self>) {
        let mut active = lock(&self.active);
        while active.len() < self.concurrency.load(Ordering::Relaxed) {
            let running: Vec<i64> = active.keys().copied().collect();
            let next = match self.store().next_queued(&running) {
                Ok(Some(id)) => id,
                _ => break,
            };
            match self
                .store()
                .transition(next, &[JobState::Queued], JobState::Downloading)
            {
                Ok(true) => {}
                _ => break,
            }
            self.emit_job(next);
            let inner = Arc::clone(self);
            let task = tokio::spawn(async move { inner.run(next).await });
            active.insert(next, task.abort_handle());
        }
    }

    async fn run(self: Arc<Self>, id: i64) {
        if let Err(error) = Arc::clone(&self).download(id).await {
            let failed = self.store().fail(id, &error.to_string()).unwrap_or(false);
            if failed {
                self.emit_job(id);
            }
        }
        lock(&self.active).remove(&id);
        self.changes.send_modify(|version| *version += 1);
        self.wake.notify_one();
    }

    async fn download(self: Arc<Self>, id: i64) -> Result<()> {
        let job = self
            .store()
            .get(id)?
            .ok_or(DownloadError::Task("the job is gone".into()))?;
        let quality = job.quality;
        let chapter = self.source.chapter(&job.chapter_id).await?;
        if !chapter.is_readable() {
            return Err(DownloadError::NotHosted);
        }
        let manga_id = chapter.manga_id.clone().ok_or(DownloadError::NoSeries)?;
        let manga = self.source.manga(&manga_id).await?;
        let languages = self.source.languages();
        let series_title = manga
            .display_title(&languages)
            .unwrap_or("Untitled")
            .to_owned();
        let folder = self.store().series_folder(
            &manga_id,
            &naming::series_folder(&series_title),
            &naming::series_folder_with_id(&series_title, &manga_id),
        )?;
        let destination = lock(&self.destination).clone();
        let path = destination
            .join(folder)
            .join(naming::chapter_file(&chapter));
        let path_text = path.to_string_lossy().into_owned();
        self.store().describe(
            id,
            &Description {
                manga_id: &manga_id,
                series_title: &series_title,
                chapter_label: &naming::chapter_label(&chapter),
                language: &chapter.language,
                path: &path_text,
            },
        )?;
        self.emit_job(id);

        let total = self.source.page_count(&chapter.id, quality).await?;
        if total == 0 {
            return Err(DownloadError::NotHosted);
        }
        let staging = Staging::new(&self.staging, &chapter.id);
        staging.create()?;
        let finished = staging.finished()?;
        let mut pending: VecDeque<usize> = (0..total)
            .filter(|index| !finished.contains_key(index))
            .collect();
        self.store().set_pages(id, total - pending.len(), total)?;
        self.emit_job(id);

        // After a failed page no new pages start, but the ones in flight
        // finish, so a resume has as little left to fetch as possible.
        // Aborting this task drops the set, which aborts them too.
        let mut pages = JoinSet::new();
        let mut failure: Option<DownloadError> = None;
        loop {
            while failure.is_none() && pages.len() < self.pages_in_flight {
                let Some(index) = pending.pop_front() else {
                    break;
                };
                let inner = Arc::clone(&self);
                let chapter_id = chapter.id.clone();
                let staging = staging.clone();
                pages.spawn(
                    async move { inner.fetch_page(&chapter_id, index, quality, staging).await },
                );
            }
            match pages.join_next().await {
                None => break,
                Some(Ok(Ok(()))) => {
                    self.store().page_done(id)?;
                    self.emit_job(id);
                }
                Some(Ok(Err(error))) => {
                    failure.get_or_insert(error);
                }
                Some(Err(error)) => {
                    failure.get_or_insert(DownloadError::Task(error.to_string()));
                }
            }
        }
        if let Some(error) = failure {
            return Err(error);
        }

        let comic_info = comic_info_xml(&chapter, &manga, &series_title, &languages, total);
        let inner = Arc::clone(&self);
        // Writing the archive is blocking I/O. It also finishes if this task
        // is aborted meanwhile, and records the job as done itself.
        tokio::task::spawn_blocking(move || inner.finish(id, &staging, &path, &comic_info, total))
            .await
            .map_err(|error| DownloadError::Task(error.to_string()))?
    }

    async fn fetch_page(
        &self,
        chapter_id: &str,
        index: usize,
        quality: ImageQuality,
        staging: Staging,
    ) -> Result<()> {
        let attempts = self.retry.attempts.max(1);
        let mut attempt = 0;
        loop {
            attempt += 1;
            self.page_limiter.acquire().await;
            match self.source.page(chapter_id, index, quality).await {
                Ok(page) => {
                    let ext = page_ext(&page.file_name, page.content_type.as_deref());
                    tokio::task::spawn_blocking(move || {
                        staging.write_page(index, &ext, &page.bytes)
                    })
                    .await
                    .map_err(|error| DownloadError::Task(error.to_string()))??;
                    return Ok(());
                }
                Err(error) if attempt < attempts && retryable(&error) => {
                    let wait = match &error {
                        MangaDexError::RateLimited { retry_after } => *retry_after,
                        _ => self
                            .retry
                            .base_delay
                            .saturating_mul(1 << (attempt - 1).min(16))
                            .min(self.retry.max_delay),
                    };
                    tokio::time::sleep(wait).await;
                }
                Err(error) => return Err(error.into()),
            }
        }
    }

    /// Builds the archive from the staged pages, swaps it in, clears the
    /// staging folder and records the job as done.
    fn finish(
        &self,
        id: i64,
        staging: &Staging,
        path: &Path,
        comic_info: &str,
        total: usize,
    ) -> Result<()> {
        let finished = staging.finished()?;
        let mut pages = Vec::with_capacity(total);
        for index in 0..total {
            let file = finished
                .get(&index)
                .ok_or(DownloadError::MissingPage { index })?;
            let ext = file
                .extension()
                .and_then(|ext| ext.to_str())
                .unwrap_or("jpg");
            pages.push((cbz::entry_name(index, ext), file.clone()));
        }
        cbz::write_atomic(path, &pages, comic_info)?;
        staging.remove()?;
        if self.store().finish(id, &path.to_string_lossy())? {
            self.emit_job(id);
        }
        Ok(())
    }
}
