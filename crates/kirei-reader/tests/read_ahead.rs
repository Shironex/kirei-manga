// Test helpers outside #[test] fns may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use kirei_archive::{ArchiveError, PageSource};
use kirei_core::{ImageFormat, PageInfo, SourceKind};
use kirei_reader::{Direction, PageCache, PageKey, ReadAheadConfig, Reader};

/// An in-memory source that counts reads and can be made slow.
struct FakeSource {
    pages: Vec<PageInfo>,
    page_len: usize,
    delay: Duration,
    reads: Vec<AtomicUsize>,
}

impl FakeSource {
    fn new(count: usize, page_len: usize, delay: Duration) -> Arc<Self> {
        let pages = (0..count)
            .map(|index| PageInfo {
                index,
                name: format!("{index:04}.png"),
                format: ImageFormat::Png,
                width: Some(1),
                height: Some(1),
                byte_len: page_len as u64,
            })
            .collect();
        Arc::new(Self {
            pages,
            page_len,
            delay,
            reads: (0..count).map(|_| AtomicUsize::new(0)).collect(),
        })
    }

    fn total_reads(&self) -> usize {
        self.reads.iter().map(|r| r.load(Ordering::SeqCst)).sum()
    }
}

impl PageSource for FakeSource {
    fn kind(&self) -> SourceKind {
        SourceKind::Folder
    }

    fn pages(&self) -> &[PageInfo] {
        &self.pages
    }

    fn read_page(&self, index: usize) -> kirei_archive::Result<Vec<u8>> {
        let counter = self.reads.get(index).ok_or(ArchiveError::PageOutOfRange {
            index,
            len: self.pages.len(),
        })?;
        counter.fetch_add(1, Ordering::SeqCst);
        std::thread::sleep(self.delay);
        Ok(vec![index as u8; self.page_len])
    }
}

fn as_source(fake: &Arc<FakeSource>) -> Arc<dyn PageSource> {
    Arc::clone(fake) as Arc<dyn PageSource>
}

fn reader(budget: usize, ahead: usize, behind: usize, workers: usize) -> Reader {
    Reader::new(
        Arc::new(PageCache::new(budget)),
        ReadAheadConfig {
            ahead,
            behind,
            workers,
        },
    )
}

#[test]
fn focus_warms_the_window_around_the_current_page() {
    let fake = FakeSource::new(20, 100, Duration::ZERO);
    let source = as_source(&fake);
    let reader = reader(100_000, 3, 1, 2);

    reader.focus(7, &source, 10, Direction::Forward);
    assert!(reader.wait_idle(Duration::from_secs(5)));

    for index in [9, 10, 11, 12, 13] {
        assert!(
            reader.cache().contains(&PageKey { source: 7, index }),
            "page {index} should be warm"
        );
    }
    assert!(!reader.cache().contains(&PageKey {
        source: 7,
        index: 14
    }));
    assert!(!reader.cache().contains(&PageKey {
        source: 7,
        index: 8
    }));

    // The page the protocol asks for next is a hit, with no second read.
    let bytes = reader.page(7, &source, 11).unwrap();
    assert_eq!(bytes[0], 11);
    assert_eq!(fake.reads[11].load(Ordering::SeqCst), 1);
    assert_eq!(reader.stats().hits, 1);
}

#[test]
fn backward_reading_warms_lower_pages() {
    let fake = FakeSource::new(20, 100, Duration::ZERO);
    let source = as_source(&fake);
    let reader = reader(100_000, 2, 1, 1);

    reader.focus(1, &source, 10, Direction::Backward);
    assert!(reader.wait_idle(Duration::from_secs(5)));
    for index in [8, 9, 10, 11] {
        assert!(reader.cache().contains(&PageKey { source: 1, index }));
    }
    assert!(!reader.cache().contains(&PageKey {
        source: 1,
        index: 12
    }));
}

#[test]
fn window_is_clamped_to_the_source() {
    let fake = FakeSource::new(3, 10, Duration::ZERO);
    let source = as_source(&fake);
    let reader = reader(10_000, 10, 10, 1);
    reader.focus(1, &source, 2, Direction::Forward);
    assert!(reader.wait_idle(Duration::from_secs(5)));
    assert_eq!(fake.total_reads(), 3);
    reader.focus(1, &source, 99, Direction::Forward);
    assert_eq!(reader.queued(), 0);
}

#[test]
fn rapid_flipping_never_builds_a_backlog() {
    let fake = FakeSource::new(200, 100, Duration::from_millis(15));
    let source = as_source(&fake);
    let (ahead, behind) = (4, 1);
    let reader = reader(1_000_000, ahead, behind, 1);

    for page in 0..100 {
        reader.focus(1, &source, page, Direction::Forward);
        // The queue only ever holds the newest window.
        assert!(reader.queued() <= 1 + ahead + behind);
    }
    assert!(reader.wait_idle(Duration::from_secs(10)));

    let stats = reader.stats();
    assert!(
        stats.dropped_stale > 0,
        "superseded windows must be dropped"
    );
    // Without dropping, 100 windows would have meant about 600 reads. With
    // one slow worker only the reads already running at each flip, plus the
    // final window, get done.
    let reads = fake.total_reads();
    assert!(
        reads < 100 + 1 + ahead + behind,
        "{reads} reads for 100 flips"
    );
    for index in 99..=99 + ahead {
        assert!(reader.cache().contains(&PageKey { source: 1, index }));
    }
}

#[test]
fn read_ahead_never_pushes_the_cache_over_budget() {
    let fake = FakeSource::new(100, 1000, Duration::ZERO);
    let source = as_source(&fake);
    // Room for 10 pages; the window asks for 21.
    let reader = reader(10_000, 15, 5, 3);

    for page in (0..100).step_by(3) {
        reader.focus(1, &source, page, Direction::Forward);
        let _ = reader.page(1, &source, page).unwrap();
        assert!(reader.cache().bytes_used() <= 10_000);
    }
    assert!(reader.wait_idle(Duration::from_secs(5)));
    assert!(reader.cache().bytes_used() <= 10_000);
    // The window is trimmed to three quarters of the budget, so the page on
    // screen is still cached after its read-ahead finished.
    assert!(reader.cache().contains(&PageKey {
        source: 1,
        index: 99
    }));
}

#[test]
fn forget_drops_queued_jobs_and_cached_pages() {
    let fake = FakeSource::new(50, 100, Duration::from_millis(20));
    let source = as_source(&fake);
    let reader = reader(100_000, 10, 0, 1);
    reader.focus(5, &source, 0, Direction::Forward);
    reader.forget(5);
    assert_eq!(reader.queued(), 0);
    assert!(reader.wait_idle(Duration::from_secs(5)));
    reader.forget(5);
    assert!(reader.cache().is_empty());
}

#[test]
fn read_errors_are_counted_not_fatal() {
    let fake = FakeSource::new(2, 10, Duration::ZERO);
    let source = as_source(&fake);
    let reader = reader(1000, 1, 0, 1);
    assert!(reader.page(1, &source, 5).is_err());
    reader.focus(1, &source, 0, Direction::Forward);
    assert!(reader.wait_idle(Duration::from_secs(5)));
    assert_eq!(reader.stats().errors, 0);
    assert_eq!(reader.stats().prefetched, 2);
}

#[test]
fn dropping_the_reader_stops_its_workers() {
    let fake = FakeSource::new(100, 10, Duration::from_millis(5));
    let source = as_source(&fake);
    let reader = reader(100_000, 50, 0, 4);
    reader.focus(1, &source, 0, Direction::Forward);
    drop(reader);
    let reads_after_drop = fake.total_reads();
    std::thread::sleep(Duration::from_millis(50));
    assert_eq!(fake.total_reads(), reads_after_drop);
}
