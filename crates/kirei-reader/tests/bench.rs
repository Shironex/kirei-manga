//! Page turn latency through the reader on a generated 3000 page CBZ.
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
use std::time::{Duration, Instant};

use kirei_archive::{OpenOptions, PageSource, open_with};
use kirei_reader::{Direction, PageCache, ReadAheadConfig, Reader};
use zip::write::SimpleFileOptions;

const PAGES: usize = 3000;
/// About the size of a JPEG manga page at reading resolution.
const PAGE_BYTES: usize = 300 * 1024;
const BUDGET: usize = 64 * 1024 * 1024;

/// Pseudo-random bytes (xorshift), so the archive cannot compress them away
/// and every read costs what a real JPEG page costs.
fn page_bytes(seed: u64) -> Vec<u8> {
    let mut state = seed.wrapping_mul(0x9e37_79b9_7f4a_7c15) | 1;
    let mut out = Vec::with_capacity(PAGE_BYTES);
    while out.len() < PAGE_BYTES {
        state ^= state << 13;
        state ^= state >> 7;
        state ^= state << 17;
        out.extend_from_slice(&state.to_le_bytes());
    }
    out.truncate(PAGE_BYTES);
    out
}

fn rss_kib() -> Option<u64> {
    let out = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output()
        .ok()?;
    String::from_utf8(out.stdout).ok()?.trim().parse().ok()
}

fn summary(mut samples: Vec<Duration>) -> String {
    samples.sort();
    let mean = samples.iter().sum::<Duration>() / samples.len() as u32;
    let p95 = samples[samples.len() * 95 / 100];
    format!("mean {mean:.2?}, p95 {p95:.2?}")
}

#[test]
#[ignore = "benchmark: run with --ignored --nocapture"]
fn bench_page_turns_through_the_reader() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("big.cbz");
    {
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        for i in 0..PAGES {
            zip.start_file(format!("{i:04}.jpg"), options).unwrap();
            zip.write_all(&page_bytes(i as u64)).unwrap();
        }
        zip.finish().unwrap();
    }
    let size_mib = std::fs::metadata(&path).unwrap().len() / 1_048_576;

    let fast = OpenOptions {
        probe_dimensions: false,
        ..OpenOptions::default()
    };
    let start = Instant::now();
    let source: Arc<dyn PageSource> = Arc::from(open_with(&path, &fast).unwrap());
    let open = start.elapsed();

    let reader = Reader::new(Arc::new(PageCache::new(BUDGET)), ReadAheadConfig::default());
    let rss_start = rss_kib();

    // Cold: every turn misses because nothing was read ahead.
    let cold: Vec<Duration> = (0..100)
        .map(|i| {
            let start = Instant::now();
            reader.page(1, &source, i * 29).unwrap();
            start.elapsed()
        })
        .collect();

    // Reading: focus, give the read-ahead the time a reader spends on a page
    // (shortened to 5 ms), then turn.
    let mut warm = Vec::new();
    for page in 1000..1300 {
        reader.focus(1, &source, page, Direction::Forward);
        let start = Instant::now();
        reader.page(1, &source, page).unwrap();
        warm.push(start.elapsed());
        std::thread::sleep(Duration::from_millis(5));
    }
    assert!(reader.wait_idle(Duration::from_secs(10)));

    // Flipping as fast as possible across the whole chapter.
    let flip_start = Instant::now();
    for page in (0..PAGES).step_by(10) {
        reader.focus(1, &source, page, Direction::Forward);
    }
    let flip = flip_start.elapsed();
    assert!(reader.wait_idle(Duration::from_secs(10)));

    let stats = reader.stats();
    let cache = reader.cache();
    println!(
        "Reader on CBZ: {PAGES} pages x {} KiB, {size_mib} MiB, cache budget {} MiB\n  \
         open (list only)        {open:.2?}\n  \
         cold page (miss)        {}\n  \
         page turn while reading {}\n  \
         300 focus calls (flip)  {flip:.2?}\n  \
         cache                   {} pages, {} KiB used (budget {} KiB)\n  \
         stats                   {stats:?}\n  \
         RSS                     {} KiB -> {} KiB",
        PAGE_BYTES / 1024,
        BUDGET / 1_048_576,
        summary(cold),
        summary(warm),
        cache.len(),
        cache.bytes_used() / 1024,
        cache.budget() / 1024,
        rss_start.map_or("n/a".into(), |v| v.to_string()),
        rss_kib().map_or("n/a".into(), |v| v.to_string()),
    );
    assert!(cache.bytes_used() <= BUDGET);
}
