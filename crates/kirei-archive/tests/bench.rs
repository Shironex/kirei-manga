//! Benchmark-style measurements on a generated 3000 page chapter.
//!
//! Ignored by default because building the fixtures takes a few seconds. Run:
//!
//! ```text
//! cargo test -p kirei-archive --release --test bench -- --ignored --nocapture
//! ```

// Test helpers outside #[test] fns may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use std::time::{Duration, Instant};

use std::io::Write;

use common::{png, write_rar};
use kirei_archive::{OpenOptions, open_with};
use zip::write::SimpleFileOptions;

const PAGES: usize = 3000;

fn name(i: usize) -> String {
    format!("chapter/{i:04}.png")
}

/// Streams the CBZ entry by entry so the fixture never sits in memory whole
/// and the RSS numbers below measure the reader, not the generator.
fn write_big_zip(path: &std::path::Path, width: u32, height: u32) {
    let mut zip = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for i in 0..PAGES {
        zip.start_file(name(i), options).unwrap();
        zip.write_all(&png(width, height, (i % 251) as u8)).unwrap();
    }
    zip.finish().unwrap();
}

fn entries(width: u32, height: u32) -> Vec<(String, Vec<u8>)> {
    (0..PAGES)
        .map(|i| (name(i), png(width, height, (i % 251) as u8)))
        .collect()
}

fn borrowed(entries: &[(String, Vec<u8>)]) -> Vec<(&str, Vec<u8>)> {
    entries
        .iter()
        .map(|(n, b)| (n.as_str(), b.clone()))
        .collect()
}

/// Resident set size of this process in KiB, where `ps` exists.
fn rss_kib() -> Option<u64> {
    let out = std::process::Command::new("ps")
        .args(["-o", "rss=", "-p", &std::process::id().to_string()])
        .output()
        .ok()?;
    String::from_utf8(out.stdout).ok()?.trim().parse().ok()
}

fn time<T>(f: impl FnOnce() -> T) -> (T, Duration) {
    let start = Instant::now();
    let value = f();
    (value, start.elapsed())
}

fn report(label: &str, path: &std::path::Path) {
    let size_mib = std::fs::metadata(path).unwrap().len() as f64 / 1_048_576.0;
    let fast = OpenOptions {
        probe_dimensions: false,
        ..OpenOptions::default()
    };
    let rss_before = rss_kib();
    let (source, open_fast) = time(|| open_with(path, &fast).unwrap());
    let (probed, open_probe) = time(|| open_with(path, &OpenOptions::default()).unwrap());
    assert_eq!(source.len(), PAGES);
    assert!(probed.pages().iter().all(|p| p.width.is_some()));
    drop(probed);

    let (first, first_page) = time(|| source.read_page(0).unwrap());
    let mut samples = Vec::new();
    // A fixed stride walks the whole archive without a random number crate.
    for step in 0..200 {
        let index = (step * 7919) % PAGES;
        let (_, took) = time(|| source.read_page(index).unwrap());
        samples.push(took);
    }
    samples.sort();
    let mean = samples.iter().sum::<Duration>() / samples.len() as u32;
    let p95 = samples[samples.len() * 95 / 100];
    let rss_after = rss_kib();

    println!(
        "{label}: {PAGES} pages, {size_mib:.1} MiB on disk, page {} KiB\n  \
         open (list only)      {open_fast:>10.2?}\n  \
         open (with sizes)     {open_probe:>10.2?}\n  \
         read page 1           {first_page:>10.2?}\n  \
         read random page      mean {mean:.2?}, p95 {p95:.2?} (200 reads)\n  \
         RSS growth            {} KiB (open, probe and 201 reads)",
        first.len() / 1024,
        match (rss_before, rss_after) {
            (Some(before), Some(after)) => after.saturating_sub(before).to_string(),
            _ => "n/a".into(),
        },
    );
}

#[test]
#[ignore = "benchmark: run with --ignored --nocapture"]
fn bench_3000_page_cbz() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("big.cbz");
    write_big_zip(&path, 400, 600);
    report("CBZ", &path);
}

#[test]
#[ignore = "benchmark: run with --ignored --nocapture"]
fn bench_3000_page_cbr() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("big.cbr");
    write_rar(
        &path,
        rars::version::ArchiveVersion::Rar50,
        &borrowed(&entries(200, 300)),
    );
    report("CBR (RAR5)", &path);
}
