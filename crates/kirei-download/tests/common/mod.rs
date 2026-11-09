// Test helpers may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used, dead_code, unreachable_pub)]

use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use kirei_download::{
    DownloadConfig, DownloadEvent, DownloadJob, Downloader, ImageQuality, Listener, PageRetry,
    RateWindow, Store,
};
use kirei_library::Library;
use kirei_mangadex::{CacheConfig, ClientConfig, Endpoints, MangaDex, RetryPolicy};
use wiremock::matchers::{method, path};
use wiremock::{Mock, MockServer, ResponseTemplate};

pub const MANGA: &str = "0b1f2c3d-0000-4000-8000-000000000001";
pub const CHAPTER: &str = "5c0a1b2c-0000-4000-8000-000000000001";
pub const CHAPTER_TWO: &str = "5c0a1b2c-0000-4000-8000-000000000002";
pub const HASH: &str = "d9786b687bc5f3fe1d4ae05ff05e0eb5";
pub const DATA: [&str; 3] = [
    "x1-b765e86d5ecbc932cf3f517a8604f6ac6d8a7f379b0277a117dc7c09c53d041e.png",
    "x2-fc7c198880083b053bf4e8aebfc0eec1adbe52878a6c5ff08d25544a1d5502ef.png",
    "x3-90f15bc8b91deb0dc88473b532e42a99f93ee9e2c8073795c81b01fff428af80.png",
];
pub const SAVER: [&str; 3] = [
    "x1-ab2b7c8f30c843aa3a53c29bc8c0e204fba4ab3e75985d761921eb6a52ff6159.jpg",
    "x2-3e057d937e01696adce2ac2865f62f6f6a15f03cef43d929b88e99a4b8482e03.jpg",
    "x3-128742088f99806b022bbc8006554456f2a20d0d176d7f3264a65ff9a549d0dd.jpg",
];
pub const SERIES_FOLDER: &str = "The Moonlit Bookshop";
pub const CHAPTER_FILE: &str = "[Nocne Tłumaczenia] Vol.01 Ch.001 - Nocny klient {5c0a1b2c}.cbz";

pub fn fixture(name: &str) -> String {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("{path}: {error}"))
}

fn json(body: String) -> ResponseTemplate {
    ResponseTemplate::new(200)
        .insert_header("content-type", "application/json")
        .set_body_string(body)
}

/// A real page image, each page its own colour so order can be checked.
pub fn page_png(index: usize) -> Vec<u8> {
    let shade = 40 + 60 * index as u8;
    let image = image::RgbImage::from_pixel(20, 30, image::Rgb([shade, 90, 160]));
    let mut out = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut out), image::ImageFormat::Png)
        .unwrap();
    out
}

/// The second chapter: same series, number 2, another group.
pub fn chapter_two_body() -> String {
    fixture("chapter.json")
        .replace(CHAPTER, CHAPTER_TWO)
        .replace("\"chapter\": \"1\"", "\"chapter\": \"2\"")
        .replace("Nocny klient", "Druga noc")
        .replace("Nocne Tłumaczenia", "Grupa Kitsune")
}

/// Chapter, series, at-home server and report endpoints. Pages are mounted
/// separately so each test decides how they behave.
pub async fn mount_api(server: &MockServer) {
    Mock::given(method("GET"))
        .and(path(format!("/chapter/{CHAPTER}")))
        .respond_with(json(fixture("chapter.json")))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/chapter/{CHAPTER_TWO}")))
        .respond_with(json(chapter_two_body()))
        .mount(server)
        .await;
    Mock::given(method("GET"))
        .and(path(format!("/manga/{MANGA}")))
        .respond_with(json(fixture("manga.json")))
        .mount(server)
        .await;
    let base = format!("{}/node", server.uri());
    Mock::given(method("GET"))
        .and(wiremock::matchers::path_regex(r"^/at-home/server/.+$"))
        .respond_with(json(fixture("at_home.json").replace("{{BASE}}", &base)))
        .mount(server)
        .await;
    Mock::given(method("POST"))
        .and(path("/report"))
        .respond_with(ResponseTemplate::new(200))
        .mount(server)
        .await;
}

pub fn page_path(quality: ImageQuality, index: usize) -> String {
    match quality {
        ImageQuality::Data => format!("/node/data/{HASH}/{}", DATA[index]),
        ImageQuality::DataSaver => format!("/node/data-saver/{HASH}/{}", SAVER[index]),
    }
}

/// Serves one page, expecting exactly `times` requests for it.
pub async fn mount_page(server: &MockServer, quality: ImageQuality, index: usize, times: u64) {
    let content_type = match quality {
        ImageQuality::Data => "image/png",
        ImageQuality::DataSaver => "image/jpeg",
    };
    Mock::given(method("GET"))
        .and(path(page_path(quality, index)))
        .respond_with(
            ResponseTemplate::new(200)
                .insert_header("content-type", content_type)
                .set_body_bytes(page_png(index)),
        )
        .expect(times)
        .mount(server)
        .await;
}

pub fn client(server: &MockServer) -> MangaDex {
    let mut config =
        ClientConfig::new("KireiManga/0.0.0-test (+https://github.com/Shironex/kirei-manga)");
    config.endpoints = Endpoints::local(&server.uri()).unwrap();
    config.retry = RetryPolicy {
        max_retries: 1,
        base_delay: Duration::from_millis(5),
        max_delay: Duration::from_secs(1),
    };
    config.cache = CacheConfig::default();
    config.image_attempts = 2;
    MangaDex::new(config).unwrap()
}

/// Folders for one test: the downloads root, staging and the queue file.
pub struct Dirs {
    pub dir: tempfile::TempDir,
}

impl Dirs {
    pub fn new() -> Self {
        Self {
            dir: tempfile::tempdir().unwrap(),
        }
    }

    pub fn downloads(&self) -> PathBuf {
        self.dir.path().join("downloads")
    }

    pub fn staging(&self) -> PathBuf {
        self.dir.path().join("staging")
    }

    pub fn queue(&self) -> PathBuf {
        self.dir.path().join("downloads.sqlite3")
    }

    pub fn archive(&self) -> PathBuf {
        self.downloads().join(SERIES_FOLDER).join(CHAPTER_FILE)
    }

    pub fn config(&self) -> DownloadConfig {
        let mut config = DownloadConfig::new(self.downloads(), self.staging());
        config.page_rate = RateWindow::per_second(50);
        config.retry = PageRetry {
            attempts: 1,
            base_delay: Duration::from_millis(5),
            max_delay: Duration::from_millis(50),
        };
        config
    }

    /// Starts a downloader as the app would at launch: a fresh client and
    /// the queue file reopened.
    pub fn start(&self, server: &MockServer) -> (Downloader<MangaDex>, Events) {
        let events = Events::default();
        let downloader = Downloader::start(
            client(server),
            Store::open(&self.queue()).unwrap(),
            self.config(),
            Some(events.listener()),
        );
        (downloader, events)
    }

    /// Every non hidden file under the downloads folder.
    pub fn visible_files(&self) -> Vec<PathBuf> {
        let mut found = Vec::new();
        walk(&self.downloads(), &mut found);
        found
    }

    /// Scans the downloads folder with the library's own scanner.
    pub fn scan(&self) -> Library {
        let library = Library::open_in_memory(&self.dir.path().join("covers")).unwrap();
        std::fs::create_dir_all(self.downloads()).unwrap();
        library.add_root(&self.downloads()).unwrap();
        library.scan(None, &|_| {}).unwrap();
        library
    }
}

fn walk(dir: &Path, found: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.is_dir() {
            walk(&path, found);
        } else {
            found.push(path);
        }
    }
}

/// Records every event the downloader sends.
#[derive(Clone, Default)]
pub struct Events(Arc<Mutex<Vec<DownloadEvent>>>);

impl Events {
    pub fn listener(&self) -> Listener {
        let events = self.0.clone();
        Arc::new(move |event: &DownloadEvent| events.lock().unwrap().push(event.clone()))
    }

    pub fn all(&self) -> Vec<DownloadEvent> {
        self.0.lock().unwrap().clone()
    }
}

/// Waits (real time, bounded) until `check` holds for the job list.
pub async fn wait_for(downloader: &Downloader<MangaDex>, check: impl Fn(&[DownloadJob]) -> bool) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
    loop {
        if check(&downloader.jobs().unwrap()) {
            return;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "timed out: {:?}",
            downloader.jobs().unwrap()
        );
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}

/// `idle()` with a deadline, so a hung test fails instead of hanging.
pub async fn settle(downloader: &Downloader<MangaDex>) {
    tokio::time::timeout(Duration::from_secs(20), downloader.idle())
        .await
        .unwrap_or_else(|_| panic!("downloads never settled: {:?}", downloader.jobs().unwrap()));
}

pub fn archive_entries(path: &Path) -> Vec<(String, Vec<u8>)> {
    use std::io::Read;
    let mut archive = zip::ZipArchive::new(std::fs::File::open(path).unwrap()).unwrap();
    let mut entries = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive.by_index(index).unwrap();
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        entries.push((file.name().unwrap().into_owned(), bytes));
    }
    entries.sort();
    entries
}
