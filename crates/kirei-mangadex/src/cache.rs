//! In-memory cache of raw response bodies for hot public reads.
//!
//! Keys are full request URLs, so a change in languages or content ratings
//! is a different key and can never serve a stale filter. Requests that carry
//! a bearer token are never cached.

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use bytes::Bytes;
use tokio::time::Instant;

#[derive(Debug)]
struct Entry {
    expires: Instant,
    stored: Instant,
    body: Bytes,
}

#[derive(Debug)]
pub(crate) struct ResponseCache {
    max_entries: usize,
    entries: Mutex<HashMap<String, Entry>>,
}

impl ResponseCache {
    pub(crate) fn new(max_entries: usize) -> Self {
        Self {
            max_entries,
            entries: Mutex::new(HashMap::new()),
        }
    }

    fn lock(&self) -> MutexGuard<'_, HashMap<String, Entry>> {
        // The map holds plain data; a panic elsewhere cannot leave it torn.
        self.entries.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub(crate) fn get(&self, key: &str) -> Option<Bytes> {
        let mut entries = self.lock();
        let now = Instant::now();
        match entries.get(key) {
            Some(entry) if entry.expires > now => Some(entry.body.clone()),
            Some(_) => {
                entries.remove(key);
                None
            }
            None => None,
        }
    }

    pub(crate) fn put(&self, key: String, body: Bytes, ttl: Duration) {
        if self.max_entries == 0 || ttl.is_zero() {
            return;
        }
        let mut entries = self.lock();
        let now = Instant::now();
        if entries.len() >= self.max_entries && !entries.contains_key(&key) {
            entries.retain(|_, entry| entry.expires > now);
            if entries.len() >= self.max_entries
                && let Some(oldest) = entries
                    .iter()
                    .min_by_key(|(_, entry)| entry.stored)
                    .map(|(key, _)| key.clone())
            {
                entries.remove(&oldest);
            }
        }
        entries.insert(
            key,
            Entry {
                expires: now + ttl,
                stored: now,
                body,
            },
        );
    }

    pub(crate) fn clear(&self) {
        self.lock().clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn entries_expire_after_their_ttl() {
        let cache = ResponseCache::new(8);
        cache.put(
            "a".into(),
            Bytes::from_static(b"1"),
            Duration::from_secs(60),
        );
        assert_eq!(cache.get("a").as_deref(), Some(&b"1"[..]));
        tokio::time::advance(Duration::from_secs(61)).await;
        assert_eq!(cache.get("a"), None);
    }

    #[tokio::test(start_paused = true)]
    async fn a_full_cache_drops_the_oldest_entry() {
        let cache = ResponseCache::new(2);
        cache.put(
            "a".into(),
            Bytes::from_static(b"1"),
            Duration::from_secs(60),
        );
        tokio::time::advance(Duration::from_secs(1)).await;
        cache.put(
            "b".into(),
            Bytes::from_static(b"2"),
            Duration::from_secs(60),
        );
        tokio::time::advance(Duration::from_secs(1)).await;
        cache.put(
            "c".into(),
            Bytes::from_static(b"3"),
            Duration::from_secs(60),
        );
        assert_eq!(cache.get("a"), None);
        assert!(cache.get("b").is_some());
        assert!(cache.get("c").is_some());
    }
}
