// Test helpers outside #[test] fns may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use std::path::Path;

use common::{CHAPTER_ORDER, chapter_entries, jpeg_header, png, write_rar, write_zip};
use kirei_archive::{ArchiveError, Limits, OpenOptions, PageSource, open, open_with};
use kirei_core::{ImageFormat, SourceKind};
use rars::version::ArchiveVersion;

fn names(source: &dyn PageSource) -> Vec<&str> {
    source.pages().iter().map(|p| p.name.as_str()).collect()
}

fn assert_chapter(source: &dyn PageSource) {
    assert_eq!(names(source), CHAPTER_ORDER);
    for (i, page) in source.pages().iter().enumerate() {
        assert_eq!(page.index, i);
    }
    let cover = &source.pages()[0];
    assert_eq!(cover.format, ImageFormat::Jpeg);
    assert_eq!((cover.width, cover.height), (Some(1200), Some(1800)));
    let page1 = &source.pages()[1];
    assert_eq!(page1.format, ImageFormat::Png);
    assert_eq!((page1.width, page1.height), (Some(40), Some(60)));
    assert_eq!(source.read_page(1).unwrap(), png(40, 60, 1));
    assert_eq!(source.read_page(3).unwrap(), png(40, 60, 10));
    assert!(matches!(
        source.read_page(4),
        Err(ArchiveError::PageOutOfRange { index: 4, len: 4 })
    ));
}

#[test]
fn cbz_lists_pages_naturally_and_skips_junk() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chapter.cbz");
    write_zip(&path, &chapter_entries());

    let source = open(&path).unwrap();
    assert_eq!(source.kind(), SourceKind::Zip);
    assert_chapter(source.as_ref());
}

#[test]
fn cbr_rar5_lists_and_reads_pages() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chapter.cbr");
    write_rar(&path, ArchiveVersion::Rar50, &chapter_entries());

    let source = open(&path).unwrap();
    assert_eq!(source.kind(), SourceKind::Rar);
    assert_chapter(source.as_ref());
}

#[test]
fn cbr_rar4_lists_and_reads_pages() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chapter.cbr");
    write_rar(&path, ArchiveVersion::Rar29, &chapter_entries());

    let source = open(&path).unwrap();
    assert_chapter(source.as_ref());
}

#[test]
fn folder_lists_direct_children_only() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::write(root.join("page10.png"), png(10, 20, 10)).unwrap();
    std::fs::write(root.join("page2.png"), png(10, 20, 2)).unwrap();
    std::fs::write(root.join("page1.jpg"), jpeg_header(300, 400)).unwrap();
    std::fs::write(root.join(".DS_Store"), b"x").unwrap();
    std::fs::write(root.join("notes.txt"), b"x").unwrap();
    std::fs::create_dir(root.join("extras")).unwrap();
    std::fs::write(root.join("extras/page0.png"), png(1, 1, 0)).unwrap();

    let source = open(root).unwrap();
    assert_eq!(source.kind(), SourceKind::Folder);
    assert_eq!(
        names(source.as_ref()),
        ["page1.jpg", "page2.png", "page10.png"]
    );
    assert_eq!(source.pages()[0].width, Some(300));
    assert_eq!(source.read_page(2).unwrap(), png(10, 20, 10));
}

#[test]
fn polish_diacritics_survive_every_backend() {
    let entries = vec![
        ("Rozdział 2/żółć 2.png", png(8, 8, 2)),
        ("Rozdział 2/Źdźbło 10.png", png(8, 8, 10)),
        ("Rozdział 2/ąę 1.png", png(8, 8, 1)),
    ];
    let expected = [
        "Rozdział 2/ąę 1.png",
        "Rozdział 2/żółć 2.png",
        "Rozdział 2/Źdźbło 10.png",
    ];
    let dir = tempfile::tempdir().unwrap();

    let zip_path = dir.path().join("Księga.cbz");
    write_zip(&zip_path, &entries);
    let rar_path = dir.path().join("Księga.cbr");
    write_rar(&rar_path, ArchiveVersion::Rar50, &entries);

    for path in [&zip_path, &rar_path] {
        let source = open(path).unwrap();
        let mut got = names(source.as_ref());
        got.sort();
        let mut want = expected.to_vec();
        want.sort();
        assert_eq!(got, want, "{}", path.display());
        let index = source
            .pages()
            .iter()
            .position(|p| p.name.ends_with("żółć 2.png"))
            .unwrap();
        assert_eq!(source.read_page(index).unwrap(), png(8, 8, 2));
    }
}

#[test]
fn misnamed_extension_is_sniffed_by_magic() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("really-a-zip.cbr");
    write_zip(&path, &[("1.png", png(2, 2, 1))]);
    assert_eq!(open(&path).unwrap().kind(), SourceKind::Zip);
}

#[test]
fn unknown_files_are_unsupported() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("x.cbz");
    std::fs::write(&path, b"definitely not an archive").unwrap();
    assert!(matches!(open(&path), Err(ArchiveError::Unsupported(_))));
    assert!(matches!(
        open(Path::new("/no/such/file.cbz")),
        Err(ArchiveError::Io { .. })
    ));
}

#[test]
fn traversal_names_are_dropped() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("evil.cbz");
    write_zip(
        &path,
        &[
            ("../../escape.png", png(2, 2, 1)),
            ("/abs.png", png(2, 2, 2)),
            ("ok.png", png(2, 2, 3)),
        ],
    );
    let source = open(&path).unwrap();
    assert_eq!(names(source.as_ref()), ["ok.png"]);
}

#[test]
fn oversized_entries_are_refused_while_reading() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("bomb.cbz");
    // Zeros deflate roughly 1000:1, the shape of a decompression bomb.
    let mut bomb = png(1, 1, 0);
    bomb.resize(4 * 1024 * 1024, 0);
    write_zip(&path, &[("1.png", bomb), ("2.png", png(2, 2, 2))]);

    let options = OpenOptions {
        limits: Limits {
            max_entry_bytes: 1024 * 1024,
            ..Limits::default()
        },
        probe_dimensions: true,
    };
    let source = open_with(&path, &options).unwrap();
    assert!(matches!(
        source.read_page(0),
        Err(ArchiveError::EntryTooLarge { .. })
    ));
    assert_eq!(source.read_page(1).unwrap(), png(2, 2, 2));
}

#[test]
fn page_count_is_capped() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("many.cbz");
    let entries: Vec<(String, Vec<u8>)> = (0..20)
        .map(|i| (format!("{i}.png"), png(1, 1, i as u8)))
        .collect();
    let borrowed: Vec<(&str, Vec<u8>)> = entries
        .iter()
        .map(|(n, b)| (n.as_str(), b.clone()))
        .collect();
    write_zip(&path, &borrowed);

    let options = OpenOptions {
        limits: Limits {
            max_pages: 10,
            ..Limits::default()
        },
        probe_dimensions: false,
    };
    assert!(matches!(
        open_with(&path, &options),
        Err(ArchiveError::TooManyPages { found: 20, max: 10 })
    ));
}

#[test]
fn skipping_the_probe_leaves_sizes_empty() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chapter.cbz");
    write_zip(&path, &chapter_entries());
    let options = OpenOptions {
        probe_dimensions: false,
        ..OpenOptions::default()
    };
    let source = open_with(&path, &options).unwrap();
    assert!(source.pages().iter().all(|p| p.width.is_none()));
}

#[test]
fn corrupt_and_truncated_archives_error_instead_of_panicking() {
    let dir = tempfile::tempdir().unwrap();
    let good = dir.path().join("good.cbz");
    write_zip(&good, &chapter_entries());
    let bytes = std::fs::read(&good).unwrap();

    // Every truncation point, plus a byte flipped at every 7th offset.
    let mut cases: Vec<Vec<u8>> = (4..bytes.len())
        .step_by(13)
        .map(|n| bytes[..n].to_vec())
        .collect();
    for offset in (0..bytes.len()).step_by(7) {
        let mut flipped = bytes.clone();
        flipped[offset] ^= 0xff;
        cases.push(flipped);
    }
    let rar = dir.path().join("good.cbr");
    write_rar(&rar, ArchiveVersion::Rar50, &chapter_entries());
    let rar_bytes = std::fs::read(&rar).unwrap();
    cases.extend(
        (7..rar_bytes.len())
            .step_by(29)
            .map(|n| rar_bytes[..n].to_vec()),
    );

    let path = dir.path().join("case.bin");
    for case in cases {
        std::fs::write(&path, &case).unwrap();
        if let Ok(source) = open(&path) {
            for index in 0..source.len() {
                let _ = source.read_page(index);
            }
        }
    }
}

#[test]
fn comic_info_is_read_from_every_backend() {
    let dir = tempfile::tempdir().unwrap();
    let xml = b"<ComicInfo/>".to_vec();

    let cbz = dir.path().join("chapter.cbz");
    write_zip(&cbz, &chapter_entries());
    let cbr = dir.path().join("chapter.cbr");
    write_rar(&cbr, ArchiveVersion::Rar50, &chapter_entries());
    let folder = dir.path().join("folder");
    std::fs::create_dir(&folder).unwrap();
    std::fs::write(folder.join("001.png"), png(4, 4, 1)).unwrap();
    std::fs::write(folder.join("ComicInfo.xml"), &xml).unwrap();

    for path in [&cbz, &cbr, &folder] {
        let source = open(path).unwrap();
        assert_eq!(
            source.comic_info().unwrap().as_deref(),
            Some(xml.as_slice()),
            "{}",
            path.display()
        );
    }
}

#[test]
fn comic_info_is_none_when_absent_or_too_deep() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chapter.cbz");
    write_zip(
        &path,
        &[
            ("a/b/ComicInfo.xml", b"<ComicInfo/>".to_vec()),
            ("a/b/001.png", png(4, 4, 1)),
        ],
    );
    assert_eq!(open(&path).unwrap().comic_info().unwrap(), None);
}

#[test]
fn oversized_comic_info_is_ignored() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("chapter.cbz");
    let huge = vec![b' '; kirei_archive::MAX_COMIC_INFO_BYTES as usize + 1];
    write_zip(&path, &[("ComicInfo.xml", huge), ("001.png", png(4, 4, 1))]);
    assert_eq!(open(&path).unwrap().comic_info().unwrap(), None);
}
