// Test helpers outside #[test] fns may unwrap: a panic is the failure report.
#![allow(clippy::unwrap_used)]

mod common;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use common::{cbz, image_folder, png, snapshot};
use kirei_core::SourceKind;
use kirei_library::{
    Library, LibraryError, ScanPhase, ScanProgress, SeriesDetail, SeriesSummary, srgb_to_oklch,
};

const ORANGE: [u8; 3] = [230, 110, 30];
const TEAL: [u8; 3] = [30, 150, 160];
const GREY: [u8; 3] = [120, 120, 120];

const MOONLIT_INFO: &str = r#"<?xml version="1.0"?>
<ComicInfo>
  <Series>The Moonlit Bookshop</Series>
  <Title>The Night Customer</Title>
  <Summary>A bookshop that opens after midnight.</Summary>
  <Writer>Hinata Okawa</Writer>
  <Year>2022</Year>
  <LanguageISO>pl</LanguageISO>
  <Genre>Mystery, Seinen</Genre>
  <Manga>YesAndRightToLeft</Manga>
  <Pages><Page Image="0"/><Page Image="1" Type="FrontCover"/></Pages>
</ComicInfo>"#;

struct Fixture {
    _dir: tempfile::TempDir,
    root: PathBuf,
    data: PathBuf,
}

/// A small library in every layout the scanner understands.
fn fixture() -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path().join("Manga");
    let data = dir.path().join("app-data");

    // Series folder with chapter archives; the first carries ComicInfo whose
    // front cover is page 1 (teal), while page 0 is grey.
    let moonlit = root.join("[Moonbeam TL] Tsukiyo no Shoten");
    write_cover_chapter(&moonlit.join("Vol.01 Ch.001.cbz"), Some(MOONLIT_INFO));
    cbz(&moonlit.join("Vol.01 Ch.002.cbz"), 3, GREY, None);
    cbz(
        &moonlit.join("Vol.02 Ch.011 - The Night Customer.cbz"),
        4,
        GREY,
        None,
    );
    cbz(&moonlit.join("Vol.02 Ch.010.5.cbz"), 2, GREY, None);

    // Volume subfolders lend their number; an image folder is a chapter.
    let ember = root.join("Ash and Ember");
    image_folder(&ember.join("Vol 01").join("c001"), 3, ORANGE);
    cbz(&ember.join("Vol 01").join("c002.cbz"), 3, ORANGE, None);
    cbz(&ember.join("c003.cbz"), 3, ORANGE, None);

    // Loose archives grouped by parsed title, plus a one-off.
    cbz(
        &root.join("[Grupa Kitsune] Wiedźma z Bieszczad - 001.cbz"),
        2,
        TEAL,
        None,
    );
    cbz(&root.join("Wiedźma z Bieszczad - 002.cbz"), 2, TEAL, None);
    cbz(&root.join("Sakura Debug Oneshot.cbz"), 2, ORANGE, None);

    // A folder of images is a one chapter series.
    image_folder(&root.join("Ice Garden"), 4, TEAL);

    // A corrupt archive is listed with its error, not dropped.
    let broken = root.join("Broken Series");
    std::fs::create_dir_all(&broken).unwrap();
    std::fs::write(broken.join("c001.cbz"), b"PK\x03\x04 truncated").unwrap();

    // Junk the scanner must ignore.
    image_folder(&root.join(".hidden"), 2, GREY);
    image_folder(&root.join("__MACOSX"), 2, GREY);
    std::fs::write(root.join("notes.txt"), b"not manga").unwrap();
    std::fs::write(root.join("loose-image.png"), png(4, 4, GREY)).unwrap();

    Fixture {
        _dir: dir,
        root,
        data,
    }
}

fn write_cover_chapter(path: &Path, comic_info: Option<&str>) {
    use std::io::Write;
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let mut zip = zip::ZipWriter::new(std::fs::File::create(path).unwrap());
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("000.png", options).unwrap();
    zip.write_all(&png(60, 90, GREY)).unwrap();
    zip.start_file("001.png", options).unwrap();
    zip.write_all(&png(600, 900, TEAL)).unwrap();
    zip.start_file("002.png", options).unwrap();
    zip.write_all(&png(60, 90, GREY)).unwrap();
    if let Some(xml) = comic_info {
        zip.start_file("ComicInfo.xml", options).unwrap();
        zip.write_all(xml.as_bytes()).unwrap();
    }
    zip.finish().unwrap();
}

fn open(fixture: &Fixture) -> Library {
    Library::open(
        &fixture.data.join("library.sqlite3"),
        &fixture.data.join("covers"),
    )
    .unwrap()
}

fn scan(library: &Library) -> kirei_library::ScanSummary {
    library.scan(None, &|_| {}).unwrap()
}

fn by_title<'a>(series: &'a [SeriesSummary], title: &str) -> &'a SeriesSummary {
    series
        .iter()
        .find(|s| s.title == title)
        .unwrap_or_else(|| panic!("no series {title:?} in {:?}", titles(series)))
}

fn titles(series: &[SeriesSummary]) -> Vec<&str> {
    series.iter().map(|s| s.title.as_str()).collect()
}

fn detail(library: &Library, series: &[SeriesSummary], title: &str) -> SeriesDetail {
    library
        .series_detail(by_title(series, title).id)
        .unwrap()
        .unwrap()
}

fn hue_distance(a: f32, b: f32) -> f32 {
    let d = (a - b).rem_euclid(360.0);
    d.min(360.0 - d)
}

#[test]
fn scans_every_layout_into_series() {
    let fixture = fixture();
    let library = open(&fixture);
    library.add_root(&fixture.root).unwrap();
    let summary = scan(&library);

    let series = library.series().unwrap();
    let mut names = titles(&series);
    names.sort_unstable();
    assert_eq!(
        names,
        [
            "Ash and Ember",
            "Broken Series",
            "Ice Garden",
            "Sakura Debug Oneshot",
            "The Moonlit Bookshop",
            "Wiedźma z Bieszczad",
        ]
    );
    assert_eq!(summary.series, 6);
    assert_eq!(summary.chapters, 12);
    assert_eq!(summary.added, 12);
    assert_eq!(summary.errors, 1);
    assert!(summary.root_errors.is_empty());

    // ComicInfo renamed the folder series and filled the metadata.
    let moonlit = detail(&library, &series, "The Moonlit Bookshop");
    assert_eq!(moonlit.writer.as_deref(), Some("Hinata Okawa"));
    assert_eq!(moonlit.year, Some(2022));
    assert_eq!(moonlit.genres, ["Mystery", "Seinen"]);
    assert_eq!(moonlit.manga.as_deref(), Some("YesAndRightToLeft"));
    let numbers: Vec<Option<f64>> = moonlit.chapters.iter().map(|c| c.number).collect();
    assert_eq!(numbers, [Some(1.0), Some(2.0), Some(10.5), Some(11.0)]);
    assert_eq!(
        moonlit.chapters[0].title.as_deref(),
        Some("The Night Customer")
    );
    assert_eq!(
        moonlit.chapters[3].title.as_deref(),
        Some("The Night Customer")
    );
    assert_eq!(moonlit.chapters[0].page_count, 3);
    assert_eq!(moonlit.chapters[3].volume, Some(2.0));

    // Volume folders lend their number; folders and archives mix.
    let ember = detail(&library, &series, "Ash and Ember");
    let shape: Vec<(Option<f64>, Option<f64>, SourceKind)> = ember
        .chapters
        .iter()
        .map(|c| (c.volume, c.number, c.kind))
        .collect();
    assert_eq!(
        shape,
        [
            (Some(1.0), Some(1.0), SourceKind::Folder),
            (Some(1.0), Some(2.0), SourceKind::Zip),
            (None, Some(3.0), SourceKind::Zip),
        ]
    );

    // Loose archives grouped by title, group read from the tag.
    let witch = detail(&library, &series, "Wiedźma z Bieszczad");
    assert_eq!(witch.chapters.len(), 2);
    assert_eq!(
        witch.chapters[0].scan_group.as_deref(),
        Some("Grupa Kitsune")
    );

    let ice = detail(&library, &series, "Ice Garden");
    assert_eq!(ice.chapters.len(), 1);
    assert_eq!(ice.chapters[0].kind, SourceKind::Folder);
    assert_eq!(ice.chapters[0].page_count, 4);

    let broken = detail(&library, &series, "Broken Series");
    assert!(broken.chapters[0].error.is_some());
    assert!(broken.summary.cover.is_none());
}

#[test]
fn covers_are_cached_with_a_palette_from_the_front_cover() {
    let fixture = fixture();
    let library = open(&fixture);
    library.add_root(&fixture.root).unwrap();
    let summary = scan(&library);
    let series = library.series().unwrap();

    // ComicInfo says page 1 (teal) is the front cover, not page 0 (grey).
    let cover = by_title(&series, "The Moonlit Bookshop")
        .cover
        .clone()
        .unwrap();
    let teal = srgb_to_oklch(TEAL[0], TEAL[1], TEAL[2]);
    assert!(!cover.palette.fallback);
    assert!(
        hue_distance(cover.palette.h, teal.h) < 3.0,
        "{:?}",
        cover.palette
    );
    assert_eq!((cover.width, cover.height), (400, 600));
    let path = Path::new(&cover.path);
    assert!(path.starts_with(fixture.data.join("covers")));
    assert_eq!(&std::fs::read(path).unwrap()[..2], &[0xff, 0xd8]);

    // The image folder cover comes from its first page.
    let ember = by_title(&series, "Ash and Ember").cover.clone().unwrap();
    let orange = srgb_to_oklch(ORANGE[0], ORANGE[1], ORANGE[2]);
    assert!(hue_distance(ember.palette.h, orange.h) < 3.0);

    // Identical cover bytes share one cache entry: Ice Garden's and the
    // witch's first pages are the same 60x90 teal PNG, and the orange image
    // folder and the orange one-shot share theirs too.
    let ice = by_title(&series, "Ice Garden").cover.clone().unwrap();
    let witch = by_title(&series, "Wiedźma z Bieszczad")
        .cover
        .clone()
        .unwrap();
    assert_eq!(ice.hash, witch.hash);
    assert_eq!(summary.covers_made, 3, "five covers, two pairs shared");

    // A rescan makes none.
    assert_eq!(scan(&library).covers_made, 0);
}

#[test]
fn rescans_are_incremental() {
    let fixture = fixture();
    let library = open(&fixture);
    library.add_root(&fixture.root).unwrap();
    scan(&library);

    let again = scan(&library);
    assert_eq!(again.unchanged, 11, "everything but the broken archive");
    assert_eq!(again.updated, 1, "failed opens are retried");
    assert_eq!(again.added, 0);

    // Grow a chapter: only it is reread.
    let chapter = fixture
        .root
        .join("[Moonbeam TL] Tsukiyo no Shoten")
        .join("Vol.01 Ch.002.cbz");
    cbz(&chapter, 5, GREY, None);
    // A new chapter appears.
    cbz(
        &fixture.root.join("Ash and Ember").join("c004.cbz"),
        2,
        ORANGE,
        None,
    );
    let third = scan(&library);
    assert_eq!(third.added, 1);
    assert_eq!(third.updated, 2, "the grown chapter and the broken one");
    assert_eq!(third.unchanged, 10);

    let series = library.series().unwrap();
    let moonlit = detail(&library, &series, "The Moonlit Bookshop");
    assert_eq!(moonlit.chapters[1].page_count, 5);
    assert_eq!(by_title(&series, "Ash and Ember").chapter_count, 4);
}

#[test]
fn vanished_files_are_marked_missing_and_keep_progress() {
    let fixture = fixture();
    let library = open(&fixture);
    library.add_root(&fixture.root).unwrap();
    scan(&library);

    let series = library.series().unwrap();
    let witch = detail(&library, &series, "Wiedźma z Bieszczad");
    let first = witch.chapters[0].id;
    library.record_progress(first, 1).unwrap();

    // Move the archive away (as an unplugged drive would).
    let file = fixture
        .root
        .join("[Grupa Kitsune] Wiedźma z Bieszczad - 001.cbz");
    let aside = fixture.root.parent().unwrap().join("aside.cbz");
    std::fs::rename(&file, &aside).unwrap();
    let summary = scan(&library);
    assert_eq!(summary.missing, 1);

    let witch = detail(&library, &library.series().unwrap(), "Wiedźma z Bieszczad");
    assert!(witch.chapters[0].missing);
    assert_eq!(witch.summary.missing_count, 1);
    assert_eq!(witch.summary.chapter_count, 1);
    assert!(!witch.summary.missing);
    assert!(witch.chapters[0].progress.as_ref().unwrap().completed);

    // Back again: same row, progress intact.
    std::fs::rename(&aside, &file).unwrap();
    scan(&library);
    let witch = detail(&library, &library.series().unwrap(), "Wiedźma z Bieszczad");
    assert_eq!(witch.chapters[0].id, first);
    assert!(!witch.chapters[0].missing);
    assert_eq!(witch.chapters[0].progress.as_ref().unwrap().page, 1);
}

#[test]
fn an_unreadable_root_marks_everything_missing_without_failing() {
    let fixture = fixture();
    let library = open(&fixture);
    library.add_root(&fixture.root).unwrap();
    scan(&library);

    let moved = fixture.root.with_file_name("Manga-unplugged");
    std::fs::rename(&fixture.root, &moved).unwrap();
    let summary = scan(&library);
    assert_eq!(summary.root_errors.len(), 1);
    assert_eq!(summary.missing, 12);
    let series = library.series().unwrap();
    assert_eq!(series.len(), 6, "rows are kept");
    assert!(series.iter().all(|s| s.missing));

    std::fs::rename(&moved, &fixture.root).unwrap();
    let summary = scan(&library);
    assert_eq!(summary.missing, 0);
    assert!(library.series().unwrap().iter().all(|s| !s.missing));
}

#[test]
fn scanning_never_modifies_user_files() {
    let fixture = fixture();
    let before = snapshot(&fixture.root);
    let library = open(&fixture);
    let root = library.add_root(&fixture.root).unwrap();
    scan(&library);
    scan(&library);
    library.remove_root(root.id).unwrap();
    assert_eq!(snapshot(&fixture.root), before);
}

#[test]
fn progress_records_completion_and_drives_continue() {
    let fixture = fixture();
    let library = open(&fixture);
    library.add_root(&fixture.root).unwrap();
    scan(&library);
    let series = library.series().unwrap();
    let moonlit = detail(&library, &series, "The Moonlit Bookshop");
    let ids: Vec<i64> = moonlit.chapters.iter().map(|c| c.id).collect();

    // Nothing read: continue starts at the first chapter.
    assert_eq!(moonlit.summary.continue_chapter_id, Some(ids[0]));

    let mid = library.record_progress(ids[0], 1).unwrap();
    assert!(!mid.completed);
    assert_eq!(mid.page_count, 3);
    let summary = by_title(&library.series().unwrap(), "The Moonlit Bookshop").clone();
    assert_eq!(summary.continue_chapter_id, Some(ids[0]));
    assert!(summary.last_read_at.is_some());

    // The last page completes it; continue moves on.
    assert!(library.record_progress(ids[0], 99).unwrap().completed);
    let summary = by_title(&library.series().unwrap(), "The Moonlit Bookshop").clone();
    assert_eq!(summary.completed_count, 1);
    assert_eq!(summary.continue_chapter_id, Some(ids[1]));

    // Rereading from the start keeps it completed.
    let reread = library.record_progress(ids[0], 0).unwrap();
    assert!(reread.completed);
    assert_eq!(reread.page, 0);

    assert!(matches!(
        library.record_progress(9_999, 0),
        Err(LibraryError::NotFound("chapter", 9_999))
    ));
}

#[test]
fn series_settings_round_trip() {
    let fixture = fixture();
    let library = open(&fixture);
    library.add_root(&fixture.root).unwrap();
    scan(&library);
    let id = library.series().unwrap()[0].id;

    assert_eq!(library.series_settings(id).unwrap(), None);
    let settings = serde_json::json!({ "mode": "webtoon", "filters": { "sepia": 20 } });
    library.set_series_settings(id, &settings).unwrap();
    assert_eq!(library.series_settings(id).unwrap(), Some(settings));
    assert!(matches!(
        library.set_series_settings(9_999, &serde_json::json!({})),
        Err(LibraryError::NotFound("series", 9_999))
    ));
}

#[test]
fn roots_cannot_overlap_and_removal_forgets_rows_only() {
    let fixture = fixture();
    let library = open(&fixture);
    let root = library.add_root(&fixture.root).unwrap();
    assert!(matches!(
        library.add_root(&fixture.root.join("Ash and Ember")),
        Err(LibraryError::OverlappingRoot { .. })
    ));
    assert!(matches!(
        library.add_root(fixture.root.parent().unwrap()),
        Err(LibraryError::OverlappingRoot { .. })
    ));
    assert!(matches!(
        library.add_root(&fixture.root.join("notes.txt")),
        Err(LibraryError::NotAFolder(_))
    ));

    scan(&library);
    assert_eq!(library.roots().unwrap()[0].series_count, 6);
    assert!(library.remove_root(root.id).unwrap());
    assert!(library.series().unwrap().is_empty());
    assert!(library.roots().unwrap().is_empty());
    assert!(!library.remove_root(root.id).unwrap());
    assert!(fixture.root.join("Ash and Ember").join("c003.cbz").exists());
}

#[test]
fn progress_reports_every_phase_and_ends_with_done() {
    let fixture = fixture();
    let library = open(&fixture);
    library.add_root(&fixture.root).unwrap();
    let events: Mutex<Vec<ScanProgress>> = Mutex::new(Vec::new());
    library
        .scan(None, &|event| events.lock().unwrap().push(event))
        .unwrap();
    let events = events.into_inner().unwrap();

    let phases: Vec<ScanPhase> = events.iter().map(|e| e.phase).collect();
    for phase in [
        ScanPhase::Discovering,
        ScanPhase::Reading,
        ScanPhase::Covers,
        ScanPhase::Saving,
    ] {
        assert!(phases.contains(&phase), "{phase:?} missing from {phases:?}");
    }
    assert_eq!(events.last().unwrap().phase, ScanPhase::Done);
    let last_read = events
        .iter()
        .rev()
        .find(|e| e.phase == ScanPhase::Reading)
        .unwrap();
    assert_eq!(last_read.done, last_read.total);
    assert_eq!(last_read.total, 12);
    assert!(!library.is_scanning());
}

#[test]
fn the_database_survives_a_reopen() {
    let fixture = fixture();
    {
        let library = open(&fixture);
        library.add_root(&fixture.root).unwrap();
        scan(&library);
    }
    let library = open(&fixture);
    assert_eq!(library.series().unwrap().len(), 6);
    assert_eq!(scan(&library).added, 0);
}

/// Opens chapter `file` of a series and records `page` on it.
fn read(library: &Library, title: &str, file: &str, page: i64) {
    let series = library.series().unwrap();
    let chapter = detail(library, &series, title)
        .chapters
        .into_iter()
        .find(|c| c.path.ends_with(file))
        .unwrap();
    library.record_progress(chapter.id, page).unwrap();
}

fn page_of(library: &Library, title: &str, file: &str) -> Option<i64> {
    let series = library.series().unwrap();
    detail(library, &series, title)
        .chapters
        .into_iter()
        .find(|c| c.path.ends_with(file))
        .unwrap()
        .progress
        .map(|p| p.page)
}

#[test]
fn removing_a_root_keeps_progress_and_settings_for_a_re_add() {
    let fixture = fixture();
    let library = open(&fixture);
    let root = library.add_root(&fixture.root).unwrap();
    scan(&library);
    read(&library, "Ash and Ember", "c003.cbz", 1);
    read(
        &library,
        "Wiedźma z Bieszczad",
        "Wiedźma z Bieszczad - 002.cbz",
        1,
    );
    let ember = by_title(&library.series().unwrap(), "Ash and Ember").id;
    let settings = serde_json::json!({ "mode": "webtoon" });
    library.set_series_settings(ember, &settings).unwrap();

    library.remove_root(root.id).unwrap();
    assert!(library.series().unwrap().is_empty());

    library.add_root(&fixture.root).unwrap();
    scan(&library);
    assert_eq!(page_of(&library, "Ash and Ember", "c003.cbz"), Some(1));
    assert_eq!(
        page_of(
            &library,
            "Wiedźma z Bieszczad",
            "Wiedźma z Bieszczad - 002.cbz"
        ),
        Some(1)
    );
    let series = library.series().unwrap();
    assert_eq!(page_of(&library, "Ash and Ember", "c002.cbz"), None);
    let ember = by_title(&series, "Ash and Ember").id;
    assert_eq!(library.series_settings(ember).unwrap(), Some(settings));
    // Nothing is left orphaned once everything re-linked.
    assert_eq!(library.purge_orphans(0).unwrap().progress, 0);
}

#[test]
fn moving_a_folder_to_another_root_restores_its_progress() {
    let fixture = fixture();
    let library = open(&fixture);
    let root = library.add_root(&fixture.root).unwrap();
    scan(&library);
    read(&library, "Ash and Ember", "c003.cbz", 2);

    library.remove_root(root.id).unwrap();
    let elsewhere = fixture.root.parent().unwrap().join("Elsewhere");
    std::fs::create_dir_all(&elsewhere).unwrap();
    std::fs::rename(
        fixture.root.join("Ash and Ember"),
        elsewhere.join("Ash and Ember"),
    )
    .unwrap();
    library.add_root(&elsewhere).unwrap();
    scan(&library);

    assert_eq!(page_of(&library, "Ash and Ember", "c003.cbz"), Some(2));
}

#[test]
fn a_different_file_under_the_same_name_does_not_inherit_progress() {
    let fixture = fixture();
    let library = open(&fixture);
    let root = library.add_root(&fixture.root).unwrap();
    scan(&library);
    read(&library, "Ash and Ember", "c003.cbz", 1);
    library.remove_root(root.id).unwrap();

    // Same name, different content (so a different size).
    cbz(
        &fixture.root.join("Ash and Ember").join("c003.cbz"),
        7,
        TEAL,
        None,
    );
    library.add_root(&fixture.root).unwrap();
    scan(&library);

    assert_eq!(page_of(&library, "Ash and Ember", "c003.cbz"), None);
    // The stale progress waits as an orphan until purged.
    assert_eq!(library.purge_orphans(0).unwrap().progress, 1);
}

#[test]
fn purge_only_removes_orphans_old_enough() {
    let fixture = fixture();
    let library = open(&fixture);
    let root = library.add_root(&fixture.root).unwrap();
    scan(&library);
    read(&library, "Ash and Ember", "c003.cbz", 1);
    let ember = by_title(&library.series().unwrap(), "Ash and Ember").id;
    library
        .set_series_settings(ember, &serde_json::json!({ "mode": "paged" }))
        .unwrap();

    // Live rows are never purged.
    assert_eq!(library.purge_orphans(0).unwrap(), Default::default());

    library.remove_root(root.id).unwrap();
    let purge = library.purge_orphans(30).unwrap();
    assert_eq!(
        (purge.progress, purge.settings),
        (0, 0),
        "orphaned just now"
    );

    // Age them 40 days and purge again.
    let conn = rusqlite::Connection::open(fixture.data.join("library.sqlite3")).unwrap();
    let old = 40 * 86_400_000_i64;
    conn.execute(
        "UPDATE reading_progress SET orphaned_at = orphaned_at - ?1",
        [old],
    )
    .unwrap();
    conn.execute(
        "UPDATE series_settings SET orphaned_at = orphaned_at - ?1",
        [old],
    )
    .unwrap();
    drop(conn);
    let purge = library.purge_orphans(30).unwrap();
    assert_eq!((purge.progress, purge.settings), (1, 1));
}
