//! Downloads against a local MangaDex stand-in: the archive, its
//! ComicInfo.xml read back by the library's own parser and scanner, resume
//! after a failure and after a kill, pause, cancel and data saver.

// Tests may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use std::time::Duration;

use common::*;
use kirei_download::{DownloadEvent, ImageQuality, JobState, temp_path};
use kirei_library::parse_comic_info;
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

fn ids(list: &[&str]) -> Vec<String> {
    list.iter().map(|id| (*id).to_owned()).collect()
}

#[tokio::test]
async fn downloads_a_chapter_into_the_library() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    for index in 0..3 {
        mount_page(&server, ImageQuality::Data, index, 1).await;
    }
    let dirs = Dirs::new();
    let (downloader, events) = dirs.start(&server);

    let added = downloader
        .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, false)
        .unwrap();
    assert_eq!(added.len(), 1);
    settle(&downloader).await;

    let job = &downloader.jobs().unwrap()[0];
    assert_eq!(job.state, JobState::Done, "{job:?}");
    assert_eq!(job.pages_done, 3);
    assert_eq!(job.pages_total, Some(3));
    assert_eq!(job.series_title.as_deref(), Some("The Moonlit Bookshop"));
    assert_eq!(
        job.chapter_label.as_deref(),
        Some("Vol. 1 Ch. 1 \u{b7} Nocny klient")
    );
    assert_eq!(job.manga_id.as_deref(), Some(MANGA));
    assert_eq!(
        job.path.as_deref(),
        Some(dirs.archive().to_string_lossy().as_ref())
    );
    assert!(!dirs.staging().join(CHAPTER).exists(), "staging is cleared");
    assert!(!temp_path(&dirs.archive()).exists());
    assert!(events.all().iter().any(
        |event| matches!(event, DownloadEvent::Changed { job } if job.state == JobState::Done)
    ));

    // Pages in order, as served, plus ComicInfo.xml.
    let entries = archive_entries(&dirs.archive());
    let names: Vec<&str> = entries.iter().map(|(name, _)| name.as_str()).collect();
    assert_eq!(
        names,
        vec!["0001.png", "0002.png", "0003.png", "ComicInfo.xml"]
    );
    for (index, (_, bytes)) in entries.iter().take(3).enumerate() {
        assert_eq!(*bytes, page_png(index));
    }

    // ComicInfo round trip through the library's parser.
    let info = parse_comic_info(&entries[3].1);
    assert_eq!(info.series.as_deref(), Some("The Moonlit Bookshop"));
    assert_eq!(info.title.as_deref(), Some("Nocny klient"));
    assert_eq!(info.number, Some(1.0));
    assert_eq!(info.volume, Some(1.0));
    assert_eq!(info.language.as_deref(), Some("pl"));
    assert_eq!(info.scan_group.as_deref(), Some("Nocne Tłumaczenia"));
    assert_eq!(info.writer.as_deref(), Some("Hinata Okawa"));
    assert_eq!(info.year, Some(2022));
    assert_eq!(info.genres, vec!["Mystery"]);
    assert_eq!(info.manga.as_deref(), Some("YesAndRightToLeft"));
    assert_eq!(
        info.summary.as_deref(),
        Some("Księgarnia otwarta po północy.")
    );
    assert_eq!(info.mangadex_id.as_deref(), Some(MANGA));
    assert!(
        info.web
            .as_deref()
            .unwrap()
            .contains(&format!("https://mangadex.org/chapter/{CHAPTER}"))
    );

    // The scanner sees one series with one readable chapter.
    let library = dirs.scan();
    let series = library.series().unwrap();
    assert_eq!(series.len(), 1);
    assert_eq!(series[0].title, "The Moonlit Bookshop");
    let detail = library.series_detail(series[0].id).unwrap().unwrap();
    assert_eq!(detail.chapters.len(), 1);
    let chapter = &detail.chapters[0];
    assert_eq!(chapter.error, None);
    assert_eq!(chapter.page_count, 3);
    assert_eq!(chapter.number, Some(1.0));
    assert_eq!(chapter.volume, Some(1.0));
    assert_eq!(chapter.title.as_deref(), Some("Nocny klient"));
    assert_eq!(chapter.language.as_deref(), Some("pl"));
    assert_eq!(chapter.scan_group.as_deref(), Some("Nocne Tłumaczenia"));
}

#[tokio::test]
async fn chapters_from_different_groups_group_into_one_series() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    for index in 0..3 {
        // Both chapters use the same image server answer in this stand-in.
        mount_page(&server, ImageQuality::Data, index, 2).await;
    }
    let dirs = Dirs::new();
    let (downloader, _) = dirs.start(&server);
    downloader
        .enqueue(&ids(&[CHAPTER, CHAPTER_TWO]), ImageQuality::Data, false)
        .unwrap();
    settle(&downloader).await;
    assert!(
        downloader
            .jobs()
            .unwrap()
            .iter()
            .all(|job| job.state == JobState::Done)
    );

    let files = dirs.visible_files();
    assert_eq!(files.len(), 2, "{files:?}");
    assert!(
        files
            .iter()
            .all(|file| file.parent().unwrap().ends_with(SERIES_FOLDER))
    );

    let library = dirs.scan();
    let series = library.series().unwrap();
    assert_eq!(series.len(), 1, "{series:?}");
    let detail = library.series_detail(series[0].id).unwrap().unwrap();
    let numbers: Vec<Option<f64>> = detail
        .chapters
        .iter()
        .map(|chapter| chapter.number)
        .collect();
    assert_eq!(numbers, vec![Some(1.0), Some(2.0)]);
    let groups: Vec<Option<&str>> = detail
        .chapters
        .iter()
        .map(|chapter| chapter.scan_group.as_deref())
        .collect();
    assert_eq!(
        groups,
        vec![Some("Nocne Tłumaczenia"), Some("Grupa Kitsune")]
    );
}

#[tokio::test]
async fn a_failed_page_keeps_the_others_and_resume_fetches_only_the_rest() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    mount_page(&server, ImageQuality::Data, 0, 1).await;
    mount_page(&server, ImageQuality::Data, 1, 1).await;
    Mock::given(method("GET"))
        .and(path(page_path(ImageQuality::Data, 2)))
        .respond_with(ResponseTemplate::new(500))
        .mount(&server)
        .await;
    let dirs = Dirs::new();
    {
        let (downloader, _) = dirs.start(&server);
        downloader
            .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, false)
            .unwrap();
        settle(&downloader).await;
        let job = &downloader.jobs().unwrap()[0];
        assert_eq!(job.state, JobState::Failed);
        assert_eq!(job.pages_done, 2);
        assert!(job.error.as_deref().unwrap().contains("page 2"), "{job:?}");
    }
    // Nothing reached the library; two whole pages wait in staging.
    assert!(dirs.visible_files().is_empty());
    assert!(dirs.scan().series().unwrap().is_empty());
    assert_eq!(
        std::fs::read_dir(dirs.staging().join(CHAPTER))
            .unwrap()
            .count(),
        2
    );
    server.verify().await;

    // Restart with the image server healthy again: pages 0 and 1 are not
    // fetched a second time.
    server.reset().await;
    mount_api(&server).await;
    mount_page(&server, ImageQuality::Data, 0, 0).await;
    mount_page(&server, ImageQuality::Data, 1, 0).await;
    mount_page(&server, ImageQuality::Data, 2, 1).await;
    let (downloader, _) = dirs.start(&server);
    assert_eq!(downloader.jobs().unwrap()[0].state, JobState::Failed);
    downloader.resume(None).unwrap();
    settle(&downloader).await;
    assert_eq!(downloader.jobs().unwrap()[0].state, JobState::Done);
    let entries = archive_entries(&dirs.archive());
    assert_eq!(entries.len(), 4);
    for (index, (_, bytes)) in entries.iter().take(3).enumerate() {
        assert_eq!(*bytes, page_png(index));
    }
}

#[tokio::test]
async fn killing_the_app_mid_download_leaves_no_archive_and_resume_finishes() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    mount_page(&server, ImageQuality::Data, 0, 1).await;
    mount_page(&server, ImageQuality::Data, 1, 1).await;
    // The last page hangs, so the kill lands between pages.
    Mock::given(method("GET"))
        .and(path(page_path(ImageQuality::Data, 2)))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_bytes(page_png(2))
                .set_delay(Duration::from_secs(60)),
        )
        .mount(&server)
        .await;
    let dirs = Dirs::new();
    {
        let (downloader, _) = dirs.start(&server);
        downloader
            .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, false)
            .unwrap();
        wait_for(&downloader, |jobs| jobs[0].pages_done == 2).await;
        // Dropping the downloader aborts every task at its next await, as a
        // killed process would stop.
    }
    assert!(!dirs.archive().exists());
    assert!(dirs.visible_files().is_empty());
    assert!(dirs.scan().series().unwrap().is_empty());

    server.reset().await;
    mount_api(&server).await;
    mount_page(&server, ImageQuality::Data, 0, 0).await;
    mount_page(&server, ImageQuality::Data, 1, 0).await;
    mount_page(&server, ImageQuality::Data, 2, 1).await;
    // The interrupted job is back in the queue and starts by itself.
    let (downloader, _) = dirs.start(&server);
    settle(&downloader).await;
    let job = &downloader.jobs().unwrap()[0];
    assert_eq!(job.state, JobState::Done, "{job:?}");
    assert_eq!(archive_entries(&dirs.archive()).len(), 4);
    assert_eq!(dirs.scan().series().unwrap().len(), 1);
}

#[tokio::test]
async fn a_leftover_partial_archive_is_invisible_and_replaced() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    for index in 0..3 {
        mount_page(&server, ImageQuality::Data, index, 1).await;
    }
    let dirs = Dirs::new();
    // What a kill during the archive write leaves: a truncated hidden file.
    let partial = temp_path(&dirs.archive());
    std::fs::create_dir_all(partial.parent().unwrap()).unwrap();
    std::fs::write(&partial, b"PK\x03\x04 cut off").unwrap();
    let library = dirs.scan();
    let series = library.series().unwrap();
    let chapters: usize = series
        .iter()
        .map(|series| {
            library
                .series_detail(series.id)
                .unwrap()
                .unwrap()
                .chapters
                .len()
        })
        .sum();
    assert_eq!(chapters, 0, "the scanner must skip the partial archive");

    let (downloader, _) = dirs.start(&server);
    downloader
        .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, false)
        .unwrap();
    settle(&downloader).await;
    assert!(!partial.exists());
    assert_eq!(archive_entries(&dirs.archive()).len(), 4);
}

#[tokio::test]
async fn data_saver_downloads_the_smaller_pages() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    for index in 0..3 {
        mount_page(&server, ImageQuality::DataSaver, index, 1).await;
        mount_page(&server, ImageQuality::Data, index, 0).await;
    }
    let dirs = Dirs::new();
    let (downloader, _) = dirs.start(&server);
    let added = downloader
        .enqueue(&ids(&[CHAPTER]), ImageQuality::DataSaver, false)
        .unwrap();
    assert_eq!(added[0].quality, ImageQuality::DataSaver);
    settle(&downloader).await;
    let names: Vec<String> = archive_entries(&dirs.archive())
        .into_iter()
        .map(|(name, _)| name)
        .collect();
    assert_eq!(
        names,
        vec!["0001.jpg", "0002.jpg", "0003.jpg", "ComicInfo.xml"]
    );
}

#[tokio::test]
async fn pause_holds_a_job_and_resume_finishes_it() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    mount_page(&server, ImageQuality::Data, 0, 1).await;
    Mock::given(method("GET"))
        .and(path(page_path(ImageQuality::Data, 1)))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_bytes(page_png(1))
                .set_delay(Duration::from_secs(60)),
        )
        .up_to_n_times(1)
        .mount(&server)
        .await;
    mount_page(&server, ImageQuality::Data, 2, 1).await;
    let dirs = Dirs::new();
    let (downloader, _) = dirs.start(&server);
    let job = downloader
        .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, false)
        .unwrap()
        .remove(0);
    wait_for(&downloader, |jobs| jobs[0].pages_done == 2).await;
    downloader.pause(Some(&[job.id])).unwrap();
    assert_eq!(downloader.jobs().unwrap()[0].state, JobState::Paused);
    settle(&downloader).await;
    assert!(!dirs.archive().exists());

    // The hung request is gone; the next one for page 1 answers at once.
    mount_page(&server, ImageQuality::Data, 1, 1).await;
    downloader.resume(Some(&[job.id])).unwrap();
    settle(&downloader).await;
    assert_eq!(downloader.jobs().unwrap()[0].state, JobState::Done);
    assert_eq!(archive_entries(&dirs.archive()).len(), 4);
}

#[tokio::test]
async fn cancel_forgets_the_job_and_its_staged_pages() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    mount_page(&server, ImageQuality::Data, 0, 1).await;
    Mock::given(method("GET"))
        .and(path(page_path(ImageQuality::Data, 1)))
        .respond_with(ResponseTemplate::new(200).set_delay(Duration::from_secs(60)))
        .mount(&server)
        .await;
    mount_page(&server, ImageQuality::Data, 2, 1).await;
    let dirs = Dirs::new();
    let (downloader, events) = dirs.start(&server);
    let job = downloader
        .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, false)
        .unwrap()
        .remove(0);
    wait_for(&downloader, |jobs| jobs[0].pages_done == 2).await;
    downloader.cancel(Some(&[job.id])).unwrap();
    settle(&downloader).await;
    assert!(downloader.jobs().unwrap().is_empty());
    assert!(!dirs.staging().join(CHAPTER).exists());
    assert!(dirs.visible_files().is_empty());
    assert!(
        events
            .all()
            .contains(&DownloadEvent::Removed { id: job.id })
    );
}

#[tokio::test]
async fn the_queue_survives_a_restart_and_skips_duplicates() {
    let server = MockServer::start().await;
    mount_api(&server).await;
    for index in 0..3 {
        mount_page(&server, ImageQuality::Data, index, 1).await;
    }
    let dirs = Dirs::new();
    {
        let (downloader, _) = dirs.start(&server);
        downloader
            .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, false)
            .unwrap();
        downloader.pause(None).unwrap();
    }
    let (downloader, _) = dirs.start(&server);
    let jobs = downloader.jobs().unwrap();
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].state, JobState::Paused);
    // Asking again does not add a second job.
    assert!(
        downloader
            .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, true)
            .unwrap()
            .is_empty()
    );
    downloader.resume(None).unwrap();
    settle(&downloader).await;
    assert_eq!(downloader.jobs().unwrap()[0].state, JobState::Done);
    // A finished chapter is not downloaded again either.
    assert!(
        downloader
            .enqueue(&ids(&[CHAPTER]), ImageQuality::Data, false)
            .unwrap()
            .is_empty()
    );
    assert_eq!(downloader.clear_finished().unwrap(), 1);
    assert!(downloader.jobs().unwrap().is_empty());
    assert!(
        dirs.archive().exists(),
        "clearing the list keeps the archive"
    );
}

#[tokio::test]
async fn bad_chapter_ids_are_refused() {
    let server = MockServer::start().await;
    let dirs = Dirs::new();
    let (downloader, _) = dirs.start(&server);
    assert!(
        downloader
            .enqueue(&ids(&["../../etc"]), ImageQuality::Data, false)
            .is_err()
    );
    assert!(downloader.jobs().unwrap().is_empty());
}
