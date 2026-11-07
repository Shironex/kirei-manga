//! The render pipeline through the reader: viewport downscale, render
//! revisions, sharing one render between the protocol and a worker,
//! cancelling renders that left the window, and the budget under load.

// Test helpers outside #[test] fns may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

use std::io::Cursor;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::time::Duration;

use image::{DynamicImage, GrayImage};
use kirei_archive::{ArchiveError, PageSource};
use kirei_core::{ImageFormat, PageInfo, SourceKind};
use kirei_reader::{Direction, PageCache, PageKey, ReadAheadConfig, Reader, RenderSettings};

const WIDTH: u32 = 400;
const HEIGHT: u32 = 600;

fn gray_jpeg() -> Vec<u8> {
    let image = GrayImage::from_fn(WIDTH, HEIGHT, |x, y| {
        image::Luma([((x * 7 + y) % 256) as u8])
    });
    let mut out = Cursor::new(Vec::new());
    DynamicImage::ImageLuma8(image)
        .write_to(&mut out, image::ImageFormat::Jpeg)
        .unwrap();
    out.into_inner()
}

/// Every page is the same real JPEG; reads are counted and can be slowed.
struct JpegSource {
    pages: Vec<PageInfo>,
    bytes: Vec<u8>,
    delay: Duration,
    reads: Vec<AtomicUsize>,
}

impl JpegSource {
    fn new(count: usize, delay: Duration) -> Arc<Self> {
        let bytes = gray_jpeg();
        let pages = (0..count)
            .map(|index| PageInfo {
                index,
                name: format!("{index:04}.jpg"),
                format: ImageFormat::Jpeg,
                width: Some(WIDTH),
                height: Some(HEIGHT),
                byte_len: bytes.len() as u64,
            })
            .collect();
        Arc::new(Self {
            pages,
            bytes,
            delay,
            reads: (0..count).map(|_| AtomicUsize::new(0)).collect(),
        })
    }

    fn reads(&self, index: usize) -> usize {
        self.reads[index].load(Ordering::SeqCst)
    }
}

impl PageSource for JpegSource {
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
        Ok(self.bytes.clone())
    }
}

fn as_source(source: &Arc<JpegSource>) -> Arc<dyn PageSource> {
    Arc::clone(source) as Arc<dyn PageSource>
}

fn reader(budget: usize, ahead: usize, workers: usize) -> Reader {
    Reader::new(
        Arc::new(PageCache::new(budget)),
        ReadAheadConfig {
            ahead,
            behind: 0,
            workers,
        },
    )
}

fn viewport(width: u32, height: u32) -> impl FnOnce(&mut RenderSettings) {
    move |settings| {
        settings.max_width = Some(width);
        settings.max_height = Some(height);
    }
}

#[test]
fn pages_are_served_at_viewport_size() {
    let fake = JpegSource::new(4, Duration::ZERO);
    let source = as_source(&fake);
    let reader = reader(10 << 20, 2, 1);

    let original = reader.page(1, &source, 0).unwrap();
    assert!(!original.downscaled);
    assert_eq!(original.bytes, fake.bytes);

    let revision = reader.update_render_settings(viewport(200, 300));
    let page = reader.page(1, &source, 0).unwrap();
    assert!(page.downscaled);
    assert_eq!((page.width, page.height), (Some(200), Some(300)));
    assert_eq!(page.revision, revision);
    assert!(page.len() < original.len());
    assert_eq!(reader.stats().downscaled, 1);
    assert_eq!(reader.stats().original, 1);
}

#[test]
fn equal_settings_keep_the_revision_and_the_cache() {
    let fake = JpegSource::new(4, Duration::ZERO);
    let source = as_source(&fake);
    let reader = reader(10 << 20, 0, 1);

    let first = reader.update_render_settings(viewport(200, 300));
    reader.page(1, &source, 0).unwrap();
    // A resize event that lands on the same box changes nothing.
    assert_eq!(reader.update_render_settings(viewport(200, 300)), first);
    assert_eq!(reader.cache().len(), 1);

    let second = reader.update_render_settings(viewport(100, 150));
    assert_eq!(second, first + 1);
    assert!(reader.cache().is_empty(), "old renders are dropped");
    assert_eq!(reader.render_settings().1, second);
}

#[test]
fn a_settings_change_refills_the_last_window() {
    let fake = JpegSource::new(10, Duration::ZERO);
    let source = as_source(&fake);
    let reader = reader(10 << 20, 2, 2);

    reader.focus(1, &source, 3, Direction::Forward);
    assert!(reader.wait_idle(Duration::from_secs(10)));
    let revision = reader.update_render_settings(viewport(200, 300));
    assert!(reader.wait_idle(Duration::from_secs(10)));
    for index in 3..=5 {
        let key = PageKey {
            source: 1,
            index,
            revision,
        };
        assert!(reader.cache().contains(&key), "page {index} re-rendered");
    }
}

#[test]
fn the_protocol_joins_a_render_already_running() {
    let fake = JpegSource::new(4, Duration::from_millis(150));
    let source = as_source(&fake);
    let reader = reader(10 << 20, 0, 1);

    reader.focus(1, &source, 0, Direction::Forward);
    // Let the worker pick the job up, then ask for the same page.
    std::thread::sleep(Duration::from_millis(30));
    let page = reader.page(1, &source, 0).unwrap();
    assert_eq!(page.bytes, fake.bytes);
    assert_eq!(fake.reads(0), 1, "one read for the worker and the protocol");
    assert_eq!(reader.stats().joined, 1);
    assert_eq!(reader.stats().misses, 0);
}

#[test]
fn renders_that_leave_the_window_are_cancelled() {
    let fake = JpegSource::new(100, Duration::from_millis(100));
    let source = as_source(&fake);
    let reader = reader(10 << 20, 0, 1);
    reader.update_render_settings(viewport(200, 300));

    reader.focus(1, &source, 0, Direction::Forward);
    std::thread::sleep(Duration::from_millis(30));
    // The worker is reading page 0; the reader jumps far away.
    reader.focus(1, &source, 50, Direction::Forward);
    assert!(reader.wait_idle(Duration::from_secs(10)));

    let stats = reader.stats();
    assert_eq!(stats.cancelled, 1, "{stats:?}");
    let revision = reader.render_settings().1;
    let key = |index| PageKey {
        source: 1,
        index,
        revision,
    };
    assert!(!reader.cache().contains(&key(0)));
    assert!(reader.cache().contains(&key(50)));
}

#[test]
fn the_budget_holds_under_concurrent_load() {
    let fake = JpegSource::new(200, Duration::ZERO);
    let source = as_source(&fake);
    let page_len = fake.bytes.len();
    // Room for about six original pages.
    let budget = page_len * 6 + page_len / 2;
    let reader = Arc::new(reader(budget, 6, 3));

    let stop = Arc::new(AtomicBool::new(false));
    let watcher = {
        let (reader, stop) = (Arc::clone(&reader), Arc::clone(&stop));
        std::thread::spawn(move || {
            let mut samples = 0;
            while !stop.load(Ordering::Relaxed) {
                assert!(reader.cache().bytes_used() <= budget);
                samples += 1;
            }
            samples
        })
    };
    let readers: Vec<_> = (0..4)
        .map(|thread| {
            let (reader, source) = (Arc::clone(&reader), Arc::clone(&source));
            std::thread::spawn(move || {
                for step in 0..20 {
                    let index = (thread * 37 + step * 13) % 200;
                    reader.focus(1, &source, index, Direction::Forward);
                    reader.page(1, &source, index).unwrap();
                    if step == 8 && thread == 0 {
                        reader.update_render_settings(viewport(300, 450));
                    }
                }
            })
        })
        .collect();
    for handle in readers {
        handle.join().unwrap();
    }
    assert!(reader.wait_idle(Duration::from_secs(10)));
    stop.store(true, Ordering::Relaxed);
    assert!(watcher.join().unwrap() > 0);
    assert!(reader.cache().bytes_used() <= budget);
}
