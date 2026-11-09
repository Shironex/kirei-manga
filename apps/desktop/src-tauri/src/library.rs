use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, PoisonError};

use kirei_archive::PageSource;
use kirei_reader::{CachedPage, Direction, PageCache, ReadAheadConfig, Reader, Resample, SourceId};

/// Cache budget for rendered pages. Pages run 200 KB to 2 MB as stored and a
/// few hundred KB once downscaled to the window, so this holds a few hundred,
/// far more than one read-ahead window.
const CACHE_BUDGET_BYTES: usize = 256 * 1024 * 1024;

/// Open sources and the reader that serves their pages. Managed Tauri state,
/// shared by the commands and the `kirei-page` protocol.
pub(crate) struct Library {
    next_id: AtomicU64,
    sources: Mutex<HashMap<SourceId, Arc<dyn PageSource>>>,
    reader: Reader,
}

impl Library {
    pub(crate) fn new() -> Self {
        Self::with_cache(CACHE_BUDGET_BYTES, ReadAheadConfig::default())
    }

    pub(crate) fn with_cache(budget: usize, config: ReadAheadConfig) -> Self {
        Self {
            next_id: AtomicU64::new(1),
            sources: Mutex::new(HashMap::new()),
            reader: Reader::new(Arc::new(PageCache::new(budget)), config),
        }
    }

    /// Opens an archive or folder and registers it under a fresh id.
    pub(crate) fn open(
        &self,
        path: &Path,
    ) -> kirei_archive::Result<(SourceId, Arc<dyn PageSource>)> {
        let source: Arc<dyn PageSource> = Arc::from(kirei_archive::open(path)?);
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.lock().insert(id, Arc::clone(&source));
        Ok((id, source))
    }

    /// Registers a source opened elsewhere (a MangaDex chapter) under a
    /// fresh id, so its pages go through the same cache and protocol.
    pub(crate) fn register(&self, source: Arc<dyn PageSource>) -> SourceId {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.lock().insert(id, source);
        id
    }

    pub(crate) fn source(&self, id: SourceId) -> Option<Arc<dyn PageSource>> {
        self.lock().get(&id).cloned()
    }

    pub(crate) fn close(&self, id: SourceId) {
        self.lock().remove(&id);
        self.reader.forget(id);
    }

    /// One rendered page, through the cache. Blocking: call off the main thread.
    pub(crate) fn page(
        &self,
        id: SourceId,
        index: usize,
    ) -> Option<kirei_archive::Result<CachedPage>> {
        let source = self.source(id)?;
        Some(self.reader.page(id, &source, index))
    }

    /// Moves the read-ahead window. Returns false for an unknown source.
    pub(crate) fn focus(&self, id: SourceId, index: usize, direction: Direction) -> bool {
        let Some(source) = self.source(id) else {
            return false;
        };
        self.reader.focus(id, &source, index, direction);
        true
    }

    /// Sets the box pages are rendered into, in device pixels (`None` for no
    /// limit on that side). Returns the render revision now in effect.
    pub(crate) fn set_viewport(&self, max_width: Option<u32>, max_height: Option<u32>) -> u64 {
        self.reader.update_render_settings(|settings| {
            settings.max_width = max_width;
            settings.max_height = max_height;
        })
    }

    /// Sets the resampling filter, the sharpening strength (0 to 100) and
    /// whether tall strips fit the box width for splitting. Returns the
    /// render revision now in effect.
    pub(crate) fn set_render_quality(
        &self,
        resample: Resample,
        sharpen: u8,
        split_tall: bool,
    ) -> u64 {
        self.reader.update_render_settings(|settings| {
            settings.resample = resample;
            settings.sharpen = sharpen.min(100);
            settings.split_tall = split_tall;
        })
    }

    pub(crate) fn reader(&self) -> &Reader {
        &self.reader
    }

    // The map is only ever inserted into or removed from, so a poisoned lock
    // still holds a consistent map.
    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<SourceId, Arc<dyn PageSource>>> {
        self.sources.lock().unwrap_or_else(PoisonError::into_inner)
    }
}
