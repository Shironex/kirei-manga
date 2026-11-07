use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use lru::LruCache;

use crate::render::RenderedPage;

/// Identifies one opened source for the lifetime of the app.
pub type SourceId = u64;

/// A rendered page, shared between the cache and whoever is serving it.
pub type CachedPage = Arc<RenderedPage>;

/// One page of one source, rendered under one render revision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PageKey {
    pub source: SourceId,
    pub index: usize,
    pub revision: u64,
}

/// A least-recently-used cache of rendered pages that never holds more than
/// its byte budget (counted as the bytes each page serves).
///
/// The budget is enforced on insert: older pages are evicted until the new one
/// fits, and a single page larger than the whole budget is not cached at all.
pub struct PageCache {
    inner: Mutex<Inner>,
    budget: usize,
}

struct Inner {
    lru: LruCache<PageKey, CachedPage>,
    bytes: usize,
}

impl PageCache {
    pub fn new(budget_bytes: usize) -> Self {
        Self {
            inner: Mutex::new(Inner {
                lru: LruCache::unbounded(),
                bytes: 0,
            }),
            budget: budget_bytes,
        }
    }

    /// The page, marking it most recently used.
    pub fn get(&self, key: &PageKey) -> Option<CachedPage> {
        self.lock().lru.get(key).cloned()
    }

    /// True when the page is cached. Does not change its recency.
    pub fn contains(&self, key: &PageKey) -> bool {
        self.lock().lru.contains(key)
    }

    /// Caches a page, evicting the least recently used ones to stay within the
    /// budget. Returns false when the page alone exceeds the budget.
    pub fn insert(&self, key: PageKey, page: CachedPage) -> bool {
        if page.len() > self.budget {
            return false;
        }
        let mut inner = self.lock();
        if let Some(old) = inner.lru.pop(&key) {
            inner.bytes -= old.len();
        }
        inner.bytes += page.len();
        inner.lru.push(key, page);
        while inner.bytes > self.budget {
            match inner.lru.pop_lru() {
                Some((_, evicted)) => inner.bytes -= evicted.len(),
                None => break,
            }
        }
        true
    }

    /// Drops every page of one source, for when it is closed.
    pub fn remove_source(&self, source: SourceId) {
        self.remove_where(|key| key.source == source);
    }

    /// Drops every page rendered under another revision than `revision`.
    pub fn retain_revision(&self, revision: u64) {
        self.remove_where(|key| key.revision != revision);
    }

    fn remove_where(&self, condition: impl Fn(&PageKey) -> bool) {
        let mut inner = self.lock();
        let keys: Vec<PageKey> = inner
            .lru
            .iter()
            .map(|(key, _)| *key)
            .filter(|key| condition(key))
            .collect();
        for key in keys {
            if let Some(bytes) = inner.lru.pop(&key) {
                inner.bytes -= bytes.len();
            }
        }
    }

    /// Bytes currently held.
    pub fn bytes_used(&self) -> usize {
        self.lock().bytes
    }

    /// Pages currently held.
    pub fn len(&self) -> usize {
        self.lock().lru.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn budget(&self) -> usize {
        self.budget
    }

    // The cache holds no invariant a panicking holder could break half way
    // (byte counts are updated beside each push and pop), so a poisoned lock
    // is still safe to use.
    fn lock(&self) -> MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn key(index: usize) -> PageKey {
        PageKey {
            source: 1,
            index,
            revision: 0,
        }
    }

    fn bytes(len: usize) -> CachedPage {
        Arc::new(RenderedPage {
            bytes: vec![0u8; len],
            mime: "image/png",
            width: None,
            height: None,
            downscaled: false,
            revision: 0,
        })
    }

    #[test]
    fn evicts_least_recently_used_to_stay_in_budget() {
        let cache = PageCache::new(100);
        assert!(cache.insert(key(0), bytes(40)));
        assert!(cache.insert(key(1), bytes(40)));
        // Touch page 0 so page 1 becomes the eviction candidate.
        assert!(cache.get(&key(0)).is_some());
        assert!(cache.insert(key(2), bytes(40)));
        assert!(cache.contains(&key(0)));
        assert!(!cache.contains(&key(1)));
        assert!(cache.contains(&key(2)));
        assert_eq!(cache.bytes_used(), 80);
    }

    #[test]
    fn never_exceeds_the_budget() {
        let cache = PageCache::new(1000);
        for i in 0..500 {
            cache.insert(key(i), bytes(1 + (i * 37) % 300));
            assert!(cache.bytes_used() <= 1000);
        }
    }

    #[test]
    fn refuses_a_page_larger_than_the_budget() {
        let cache = PageCache::new(10);
        assert!(!cache.insert(key(0), bytes(11)));
        assert!(cache.is_empty());
    }

    #[test]
    fn replacing_a_page_does_not_double_count() {
        let cache = PageCache::new(100);
        cache.insert(key(0), bytes(30));
        cache.insert(key(0), bytes(50));
        assert_eq!(cache.bytes_used(), 50);
        assert_eq!(cache.len(), 1);
    }

    #[test]
    fn removes_one_source_only() {
        let cache = PageCache::new(100);
        cache.insert(
            PageKey {
                source: 1,
                index: 0,
                revision: 0,
            },
            bytes(10),
        );
        cache.insert(
            PageKey {
                source: 2,
                index: 0,
                revision: 0,
            },
            bytes(10),
        );
        cache.remove_source(1);
        assert_eq!(cache.len(), 1);
        assert_eq!(cache.bytes_used(), 10);
    }

    #[test]
    fn retains_only_the_current_revision() {
        let cache = PageCache::new(100);
        cache.insert(key(0), bytes(10));
        let newer = PageKey {
            revision: 1,
            ..key(0)
        };
        cache.insert(newer, bytes(20));
        cache.retain_revision(1);
        assert!(cache.contains(&newer));
        assert!(!cache.contains(&key(0)));
        assert_eq!(cache.bytes_used(), 20);
    }
}
