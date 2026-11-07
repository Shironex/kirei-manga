//! Page turn latency and memory through the reader on a generated 3000 page
//! CBZ of real JPEG pages at scan resolution.
//!
//! Ignored by default. Run:
//!
//! ```text
//! cargo test -p kirei-reader --release --test bench -- --ignored --nocapture
//! ```

// Test helpers outside #[test] fns may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

use std::io::Write;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant};

use image::codecs::jpeg::JpegEncoder;
use kirei_archive::{OpenOptions, PageSource, open_with};
use kirei_reader::{Direction, PageCache, ReadAheadConfig, Reader};
use zip::write::SimpleFileOptions;

const PAGES: usize = 3000;
/// A high resolution scan, larger than any window it is shown in.
const PAGE_WIDTH: u32 = 1800;
const PAGE_HEIGHT: u32 = 2700;
/// Distinct page images, cycled through the archive. Encoding 3000 scans
/// would make the fixture slower than the benchmark.
const DISTINCT: usize = 12;
const BUDGET: usize = 256 * 1024 * 1024;

/// A grayscale page that compresses like a real one: white paper, black
/// panel borders, a screentone patch and some noise. Pseudo-random from `seed`.
fn page_jpeg(seed: u64) -> Vec<u8> {
    let mut state = seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1;
    let mut next = move || {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        state
    };
    let (w, h) = (PAGE_WIDTH as usize, PAGE_HEIGHT as usize);
    let mut pixels = vec![250u8; w * h];
    let panel_split = h / 3 + (next() % (h as u64 / 3)) as usize;
    let tone_top = (next() % (h as u64 / 2)) as usize;
    for y in 0..h {
        for x in 0..w {
            let border = x < 60 || x >= w - 60 || y < 60 || y >= h - 60;
            let gutter = y.abs_diff(panel_split) < 8;
            let tone = (tone_top..tone_top + h / 4).contains(&y) && x > w / 2;
            let value = if border || gutter {
                20
            } else if tone && (x / 6 + y / 6) % 2 == 0 {
                90
            } else if next() % 160 == 0 {
                (next() % 200) as u8
            } else {
                245
            };
            pixels[y * w + x] = value;
        }
    }
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 90)
        .encode(
            &pixels,
            PAGE_WIDTH,
            PAGE_HEIGHT,
            image::ExtendedColorType::L8,
        )
        .unwrap();
    out
}

fn rss_kib() -> Option<u64> {
    let out = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output()
        .ok()?;
    String::from_utf8(out.stdout).ok()?.trim().parse().ok()
}

/// Samples RSS every 20 ms on a helper thread and keeps the highest value.
struct PeakRss {
    peak: Arc<AtomicU64>,
    stop: Arc<AtomicBool>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl PeakRss {
    fn start() -> Self {
        let peak = Arc::new(AtomicU64::new(rss_kib().unwrap_or(0)));
        let stop = Arc::new(AtomicBool::new(false));
        let handle = {
            let (peak, stop) = (Arc::clone(&peak), Arc::clone(&stop));
            std::thread::spawn(move || {
                while !stop.load(Ordering::Relaxed) {
                    if let Some(rss) = rss_kib() {
                        peak.fetch_max(rss, Ordering::Relaxed);
                    }
                    std::thread::sleep(Duration::from_millis(20));
                }
            })
        };
        Self {
            peak,
            stop,
            handle: Some(handle),
        }
    }

    fn finish(mut self) -> u64 {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            handle.join().unwrap();
        }
        self.peak.load(Ordering::Relaxed)
    }
}

fn summary(mut samples: Vec<Duration>) -> String {
    samples.sort();
    let p50 = samples[samples.len() / 2];
    let p95 = samples[samples.len() * 95 / 100];
    let max = samples[samples.len() - 1];
    format!("p50 {p50:.2?}, p95 {p95:.2?}, max {max:.2?}")
}

#[test]
#[ignore = "benchmark: run with --ignored --nocapture"]
fn bench_page_turns_through_the_reader() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("big.cbz");
    let distinct: Vec<Vec<u8>> = (0..DISTINCT).map(|i| page_jpeg(i as u64)).collect();
    let page_kib = distinct.iter().map(Vec::len).sum::<usize>() / DISTINCT / 1024;
    {
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for i in 0..PAGES {
            zip.start_file(format!("{i:04}.jpg"), options).unwrap();
            zip.write_all(&distinct[i % DISTINCT]).unwrap();
        }
        zip.finish().unwrap();
    }
    drop(distinct);
    let size_mib = std::fs::metadata(&path).unwrap().len() / 1_048_576;

    let rss_start = rss_kib();
    let peak = PeakRss::start();
    let start = Instant::now();
    let source: Arc<dyn PageSource> = Arc::from(open_with(&path, &OpenOptions::default()).unwrap());
    let open = start.elapsed();

    let reader = Reader::new(Arc::new(PageCache::new(BUDGET)), ReadAheadConfig::default());

    // Cold: every turn misses because nothing was read ahead.
    let mut served_bytes = 0usize;
    let cold: Vec<Duration> = (0..100)
        .map(|i| {
            let start = Instant::now();
            served_bytes += reader.page(1, &source, i * 29).unwrap().len();
            start.elapsed()
        })
        .collect();

    // Reading: focus, give the read-ahead the time a fast reader spends on a
    // page (shortened to 40 ms), then turn.
    let mut warm = Vec::new();
    for page in 1000..1300 {
        reader.focus(1, &source, page, Direction::Forward);
        let start = Instant::now();
        reader.page(1, &source, page).unwrap();
        warm.push(start.elapsed());
        std::thread::sleep(Duration::from_millis(40));
    }
    assert!(reader.wait_idle(Duration::from_secs(30)));

    // Scrubbing: jump ten pages at a time with no pause, loading each page
    // the way a scrub bar preview would, across the whole chapter.
    let mut scrub = Vec::new();
    let mut max_queue = 0;
    for page in (0..PAGES).step_by(10) {
        reader.focus(1, &source, page, Direction::Forward);
        max_queue = max_queue.max(reader.queued());
        let start = Instant::now();
        reader.page(1, &source, page).unwrap();
        scrub.push(start.elapsed());
    }
    assert!(reader.wait_idle(Duration::from_secs(30)));
    let peak_kib = peak.finish();

    let stats = reader.stats();
    let cache = reader.cache();
    println!(
        "Reader on CBZ: {PAGES} JPEG pages {PAGE_WIDTH}x{PAGE_HEIGHT}, ~{page_kib} KiB each, \
         {size_mib} MiB, cache budget {} MiB\n  \
         open (with sizes)       {open:.2?}\n  \
         cold page (miss)        {}\n  \
         bytes served per page   {} KiB (cold pages)\n  \
         page turn while reading {}\n  \
         page turn while scrub   {} (max queue {max_queue})\n  \
         cache                   {} pages, {} KiB used (budget {} KiB)\n  \
         stats                   {stats:?}\n  \
         RSS                     start {} KiB, peak {peak_kib} KiB, end {} KiB",
        BUDGET / 1_048_576,
        summary(cold),
        served_bytes / 100 / 1024,
        summary(warm),
        summary(scrub),
        cache.len(),
        cache.bytes_used() / 1024,
        cache.budget() / 1024,
        rss_start.map_or("n/a".into(), |v| v.to_string()),
        rss_kib().map_or("n/a".into(), |v| v.to_string()),
    );
    assert!(cache.bytes_used() <= BUDGET);
}
