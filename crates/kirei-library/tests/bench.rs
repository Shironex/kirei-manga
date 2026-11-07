//! Scan benchmark on a generated library: 200 series x 25 chapters = 5000
//! chapters. Odd chapters are CBZ archives of 3 pages, even ones are folders
//! of 3 images, so the tree holds 2500 archives and 7500 loose images:
//! 10 000 files.
//!
//! Ignored by default because the fixture takes a while to build. Run:
//!
//! ```text
//! cargo test -p kirei-library --release --test bench -- --ignored --nocapture
//! ```

#![allow(clippy::unwrap_used)]

mod common;

use std::time::Instant;

use common::{cbz, image_folder};
use kirei_library::Library;

const SERIES: usize = 200;
const CHAPTERS: usize = 25;

#[test]
#[ignore = "builds a 10k file tree; run with --ignored --release"]
fn scan_5000_chapters() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Manga");

    let start = Instant::now();
    for s in 0..SERIES {
        let series = root.join(format!("Series {s:03}"));
        // Different colours per series, so every cover is its own entry.
        let rgb = [
            (s * 37 % 256) as u8,
            (s * 91 % 256) as u8,
            (s * 53 % 256) as u8,
        ];
        for c in 1..=CHAPTERS {
            if c % 2 == 1 {
                cbz(
                    &series.join(format!("Vol.{:02} Ch.{c:03}.cbz", c / 10 + 1)),
                    3,
                    rgb,
                    None,
                );
            } else {
                image_folder(&series.join(format!("Ch.{c:03}")), 3, rgb);
            }
        }
    }
    let built = start.elapsed();

    let library = Library::open(
        &dir.path().join("data/library.sqlite3"),
        &dir.path().join("data/covers"),
    )
    .unwrap();
    library.add_root(&root).unwrap();

    let start = Instant::now();
    let first = library.scan(None, &|_| {}).unwrap();
    let first_time = start.elapsed();
    assert_eq!(first.series, SERIES);
    assert_eq!(first.chapters, SERIES * CHAPTERS);
    assert_eq!(first.added, SERIES * CHAPTERS);
    assert_eq!(first.covers_made, SERIES);

    let start = Instant::now();
    let again = library.scan(None, &|_| {}).unwrap();
    let again_time = start.elapsed();
    assert_eq!(again.unchanged, SERIES * CHAPTERS);
    assert_eq!(again.covers_made, 0);

    // Touch 50 archives (grow them by a page).
    for s in 0..50 {
        let rgb = [1, 2, 3];
        cbz(
            &root
                .join(format!("Series {s:03}"))
                .join("Vol.01 Ch.003.cbz"),
            4,
            rgb,
            None,
        );
    }
    let start = Instant::now();
    let touched = library.scan(None, &|_| {}).unwrap();
    let touched_time = start.elapsed();
    assert_eq!(touched.updated, 50);

    let start = Instant::now();
    let list = library.series().unwrap();
    let list_time = start.elapsed();
    assert_eq!(list.len(), SERIES);

    println!(
        "fixture: {SERIES} series, {} chapters, 10000 files, built in {built:.2?}",
        SERIES * CHAPTERS
    );
    println!(
        "first scan:        {first_time:.2?} ({} covers)",
        first.covers_made
    );
    println!("rescan, unchanged: {again_time:.2?}");
    println!("rescan, 50 grown:  {touched_time:.2?}");
    println!("list series:       {list_time:.2?}");
}
