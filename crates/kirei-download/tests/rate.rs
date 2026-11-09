//! The page budget on a paused clock: many chapters at once never start
//! more pages in any window than the budget allows, and never run more
//! chapters or pages in flight than configured. A source with no network
//! stands in for MangaDex, so the clock can jump.

// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use bytes::Bytes;
use kirei_download::{
    ChapterSource, DownloadConfig, Downloader, ImageQuality, JobState, PageRetry, RateWindow, Store,
};
use kirei_mangadex::{Chapter, ContentRating, LocalizedText, Manga, MangaDexError, PageImage};
use tokio::time::Instant;

const PAGES: usize = 20;
const CHAPTERS: usize = 4;

#[derive(Clone, Default)]
struct Offline {
    starts: Arc<Mutex<Vec<Instant>>>,
    in_flight: Arc<AtomicUsize>,
    most_in_flight: Arc<AtomicUsize>,
}

fn chapter(id: &str) -> Chapter {
    Chapter {
        id: id.to_owned(),
        manga_id: Some("0b1f2c3d-0000-4000-8000-000000000001".into()),
        title: None,
        volume: None,
        chapter: Some(
            id.rsplit('-')
                .next()
                .unwrap()
                .trim_start_matches('0')
                .to_owned(),
        ),
        pages: PAGES as u32,
        language: "en".into(),
        external_url: None,
        publish_at: None,
        readable_at: None,
        updated_at: None,
        groups: Vec::new(),
        uploader: None,
    }
}

fn manga(id: &str) -> Manga {
    Manga {
        id: id.to_owned(),
        title: LocalizedText(BTreeMap::from([("en".to_owned(), "Offline".to_owned())])),
        alt_titles: Vec::new(),
        description: LocalizedText::default(),
        original_language: "ko".into(),
        status: None,
        demographic: None,
        content_rating: ContentRating::Safe,
        year: None,
        last_volume: None,
        last_chapter: None,
        tags: Vec::new(),
        available_languages: Vec::new(),
        chapter_numbers_reset_on_new_volume: false,
        links: BTreeMap::new(),
        cover: None,
        authors: Vec::new(),
        artists: Vec::new(),
        updated_at: None,
    }
}

impl ChapterSource for Offline {
    async fn chapter(&self, id: &str) -> Result<Chapter, MangaDexError> {
        Ok(chapter(id))
    }

    async fn manga(&self, id: &str) -> Result<Manga, MangaDexError> {
        Ok(manga(id))
    }

    async fn page_count(&self, _: &str, _: ImageQuality) -> Result<usize, MangaDexError> {
        Ok(PAGES)
    }

    async fn page(
        &self,
        _: &str,
        index: usize,
        _: ImageQuality,
    ) -> Result<PageImage, MangaDexError> {
        self.starts.lock().unwrap().push(Instant::now());
        let now = self.in_flight.fetch_add(1, Ordering::SeqCst) + 1;
        self.most_in_flight.fetch_max(now, Ordering::SeqCst);
        // A slow image server: each page takes 800 ms.
        tokio::time::sleep(Duration::from_millis(800)).await;
        self.in_flight.fetch_sub(1, Ordering::SeqCst);
        Ok(PageImage {
            bytes: Bytes::from(vec![index as u8; 64]),
            content_type: Some("image/jpeg".into()),
            file_name: format!("{index}.jpg"),
        })
    }

    fn languages(&self) -> Vec<String> {
        vec!["en".into()]
    }
}

#[tokio::test(start_paused = true)]
async fn downloads_never_exceed_the_page_budget() {
    let dir = tempfile::tempdir().unwrap();
    let source = Offline::default();
    let budget = RateWindow::per_second(5);
    let mut config = DownloadConfig::new(dir.path().join("downloads"), dir.path().join("staging"));
    config.concurrency = 2;
    config.pages_in_flight = 3;
    config.page_rate = budget;
    config.retry = PageRetry::default();
    let downloader = Downloader::start(
        source.clone(),
        Store::open_in_memory().unwrap(),
        config,
        None,
    );

    let ids: Vec<String> = (1..=CHAPTERS)
        .map(|n| format!("5c0a1b2c-0000-4000-8000-{n:012}"))
        .collect();
    let started = Instant::now();
    downloader.enqueue(&ids, ImageQuality::Data, false).unwrap();
    downloader.idle().await;

    let jobs = downloader.jobs().unwrap();
    assert!(
        jobs.iter().all(|job| job.state == JobState::Done),
        "{jobs:?}"
    );

    let starts = source.starts.lock().unwrap().clone();
    assert_eq!(starts.len(), PAGES * CHAPTERS);
    let max = budget.max as usize;
    for window in starts.windows(max + 1) {
        assert!(
            window[max] - window[0] >= budget.per,
            "{} pages started within {:?}",
            max + 1,
            window[max] - window[0]
        );
    }
    // 80 pages at 5 a second cannot take less than 15 s.
    assert!(Instant::now() - started >= Duration::from_secs(15));
    // Two chapters with three pages each at most.
    assert!(source.most_in_flight.load(Ordering::SeqCst) <= 6);
}
