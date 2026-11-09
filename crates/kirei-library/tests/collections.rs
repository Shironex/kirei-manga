//! Collections, tags, Want to Read and smart filters against a real
//! database: what the lists hold, how they survive a removed root, and that
//! filters stay fast and use their indexes on a 5000 series library.

#![allow(clippy::unwrap_used)]

mod common;

use std::path::Path;
use std::time::{Duration, Instant};

use common::cbz;
use kirei_library::{
    FilterQuery, FilterSort, ItemSource, Library, LibraryError, ReadStatus, SeriesRef,
    SourceFilter, TagMode,
};
use rusqlite::{Connection, params};

const TEAL: [u8; 3] = [30, 150, 160];

fn local(series_id: i64) -> SeriesRef {
    SeriesRef::Local { series_id }
}

fn remote(id: &str, title: &str) -> SeriesRef {
    SeriesRef::MangaDex {
        remote_id: id.to_owned(),
        title: Some(title.to_owned()),
        cover_file: None,
    }
}

struct Scanned {
    _dir: tempfile::TempDir,
    manga: std::path::PathBuf,
    library: Library,
}

/// Three scanned series: Ash (2 chapters), Bloom and Cinder (1 each).
fn scanned() -> Scanned {
    let dir = tempfile::tempdir().unwrap();
    let manga = dir.path().join("Manga");
    for (series, chapters) in [("Ash", 2), ("Bloom", 1), ("Cinder", 1)] {
        for c in 1..=chapters {
            cbz(
                &manga.join(series).join(format!("Ch.{c:03}.cbz")),
                3,
                TEAL,
                None,
            );
        }
    }
    let library = Library::open(
        &dir.path().join("data/library.sqlite3"),
        &dir.path().join("data/covers"),
    )
    .unwrap();
    library.add_root(&manga).unwrap();
    library.scan(None, &|_| {}).unwrap();
    Scanned {
        _dir: dir,
        manga,
        library,
    }
}

fn id_of(library: &Library, title: &str) -> i64 {
    library
        .series()
        .unwrap()
        .into_iter()
        .find(|s| s.title == title)
        .unwrap()
        .id
}

fn titles(items: &[kirei_library::ShelfItem]) -> Vec<&str> {
    items.iter().map(|i| i.title.as_str()).collect()
}

#[test]
fn tags_are_free_text_shared_ignoring_case_and_go_with_their_last_use() {
    let fx = scanned();
    let lib = &fx.library;
    let (ash, bloom) = (id_of(lib, "Ash"), id_of(lib, "Bloom"));

    let tag = lib
        .tag_series(&[local(ash), local(bloom)], "  Cosy   reads ")
        .unwrap();
    assert_eq!(tag.name, "Cosy reads");
    assert_eq!(tag.count, 2);
    let again = lib.tag_series(&[local(ash)], "cosy READS").unwrap();
    assert_eq!(again.id, tag.id, "the same tag, whatever the case");
    assert_eq!(lib.tags().unwrap().len(), 1);

    assert!(matches!(
        lib.tag_series(&[local(ash)], "   "),
        Err(LibraryError::InvalidInput(_))
    ));

    lib.untag_series(&[local(ash), local(bloom)], tag.id)
        .unwrap();
    assert!(lib.tags().unwrap().is_empty(), "an unused tag is deleted");
}

#[test]
fn renaming_a_tag_onto_another_merges_them_and_saved_filters_follow() {
    let fx = scanned();
    let lib = &fx.library;
    let (ash, bloom) = (id_of(lib, "Ash"), id_of(lib, "Bloom"));
    let a = lib.tag_series(&[local(ash)], "Isekai").unwrap();
    let b = lib.tag_series(&[local(bloom)], "Fantasy").unwrap();
    let filter = lib
        .save_filter(
            None,
            "Isekai",
            &FilterQuery {
                tags: vec![a.id],
                ..FilterQuery::default()
            },
            true,
        )
        .unwrap();

    let merged = lib.rename_tag(a.id, "fantasy").unwrap();
    assert_eq!(merged.id, b.id);
    assert_eq!(merged.count, 2);
    let saved = lib.smart_filters().unwrap();
    assert_eq!(saved[0].id, filter.id);
    assert_eq!(saved[0].query.tags, vec![b.id]);
}

#[test]
fn collections_keep_the_users_order_and_a_cover_pick() {
    let fx = scanned();
    let lib = &fx.library;
    let (ash, bloom, cinder) = (id_of(lib, "Ash"), id_of(lib, "Bloom"), id_of(lib, "Cinder"));
    let fav = lib.create_collection("Favourites").unwrap();
    let later = lib.create_collection("Later").unwrap();
    assert!(matches!(
        lib.create_collection("favourites"),
        Err(LibraryError::InvalidInput(_))
    ));

    lib.add_to_collection(fav.id, &[local(cinder), local(ash), local(bloom)])
        .unwrap();
    lib.add_to_collection(fav.id, &[local(ash)]).unwrap();
    assert_eq!(
        titles(&lib.collection_items(fav.id).unwrap()),
        ["Cinder", "Ash", "Bloom"],
        "added in order, and adding again keeps the place"
    );

    let items = lib.collection_items(fav.id).unwrap();
    let ref_of = |title: &str| items.iter().find(|i| i.title == title).unwrap().ref_id;
    lib.reorder_collection(fav.id, &[ref_of("Bloom").unwrap()])
        .unwrap();
    assert_eq!(
        titles(&lib.collection_items(fav.id).unwrap()),
        ["Bloom", "Cinder", "Ash"]
    );

    let picked = lib.set_collection_cover(fav.id, ref_of("Ash")).unwrap();
    assert_eq!(
        picked.preview[0].title, "Ash",
        "the cover leads the preview"
    );
    assert_eq!(picked.count, 3);

    lib.remove_from_collection(fav.id, &[local(ash)]).unwrap();
    let fav_now = lib
        .collections()
        .unwrap()
        .into_iter()
        .find(|c| c.id == fav.id)
        .unwrap();
    assert_eq!(
        fav_now.cover_ref_id, None,
        "removing the cover member drops the pick"
    );
    assert_eq!(fav_now.preview[0].title, "Bloom");

    lib.reorder_collections(&[later.id, fav.id]).unwrap();
    let names: Vec<_> = lib
        .collections()
        .unwrap()
        .into_iter()
        .map(|c| c.name)
        .collect();
    assert_eq!(names, ["Later", "Favourites"]);

    let renamed = lib.rename_collection(later.id, "Someday").unwrap();
    assert_eq!(renamed.name, "Someday");
    assert!(lib.delete_collection(later.id).unwrap());
    assert_eq!(lib.collections().unwrap()[0].position, 0);
}

#[test]
fn want_to_read_takes_local_series_and_mangadex_titles() {
    let fx = scanned();
    let lib = &fx.library;
    let ash = id_of(lib, "Ash");
    lib.set_want_to_read(&[local(ash)], true).unwrap();
    lib.set_want_to_read(&[remote("a1b2-uuid", "Frieren")], true)
        .unwrap();

    let list = lib.want_to_read().unwrap();
    assert_eq!(titles(&list), ["Frieren", "Ash"], "newest first");
    assert_eq!(list[0].source, ItemSource::MangaDex);
    assert_eq!(list[0].remote_id.as_deref(), Some("a1b2-uuid"));
    assert_eq!(list[1].series_id, Some(ash));
    assert_eq!(lib.shelf_overview().unwrap().want_count, 2);

    // The same remote title is one row; a later call can refresh its title.
    let fav = lib.create_collection("Online").unwrap();
    lib.add_to_collection(fav.id, &[remote("a1b2-uuid", "Frieren: Beyond")])
        .unwrap();
    assert_eq!(lib.want_to_read().unwrap()[0].title, "Frieren: Beyond");

    lib.set_want_to_read(&[local(ash), remote("a1b2-uuid", "")], false)
        .unwrap();
    assert!(lib.want_to_read().unwrap().is_empty());
    assert_eq!(lib.collection_items(fav.id).unwrap().len(), 1);
}

#[test]
fn the_selection_shelf_counts_what_the_selection_carries() {
    let fx = scanned();
    let lib = &fx.library;
    let (ash, bloom) = (id_of(lib, "Ash"), id_of(lib, "Bloom"));
    lib.tag_series(&[local(ash), local(bloom)], "Shared")
        .unwrap();
    lib.tag_series(&[local(ash)], "Only Ash").unwrap();
    let fav = lib.create_collection("Fav").unwrap();
    lib.add_to_collection(fav.id, &[local(bloom)]).unwrap();
    lib.set_want_to_read(&[local(ash)], true).unwrap();

    let shelf = lib.selection_shelf(&[local(ash), local(bloom)]).unwrap();
    assert_eq!(shelf.size, 2);
    assert_eq!(shelf.want_count, 1);
    let count = |name: &str| shelf.tags.iter().find(|t| t.name == name).unwrap().count;
    assert_eq!(count("Shared"), 2);
    assert_eq!(count("Only Ash"), 1);
    assert_eq!(shelf.collections[0].count, 1);

    // A MangaDex title reads the same way, and one never organised carries nothing.
    let dex = remote("d-1", "Dex");
    lib.add_to_collection(fav.id, std::slice::from_ref(&dex))
        .unwrap();
    let shelf = lib.selection_shelf(&[dex]).unwrap();
    assert_eq!((shelf.size, shelf.want_count), (1, 0));
    assert_eq!(shelf.collections[0].count, 1);
    let unknown = lib.selection_shelf(&[remote("d-2", "")]).unwrap();
    assert!(unknown.tags.iter().all(|t| t.count == 0));
    assert!(unknown.collections.iter().all(|c| c.count == 0));
}

#[test]
fn the_orphan_purge_drops_empty_references_and_keeps_the_rest() {
    let fx = scanned();
    let lib = &fx.library;
    let (ash, bloom) = (id_of(lib, "Ash"), id_of(lib, "Bloom"));
    lib.tag_series(&[local(ash)], "Kept").unwrap();
    lib.set_want_to_read(&[local(bloom), remote("d-1", "Dex")], true)
        .unwrap();
    lib.remove_root(lib.roots().unwrap()[0].id).unwrap();

    // A reference a removed folder left with nothing on it (an older build
    // or a half finished edit), next to the two that still carry something.
    let conn = Connection::open(fx._dir.path().join("data/library.sqlite3")).unwrap();
    conn.execute(
        "INSERT INTO series_refs (series_ident, created_at, updated_at) VALUES ('dir:Gone', 0, 0)",
        [],
    )
    .unwrap();
    let refs = |conn: &Connection| -> i64 {
        conn.query_row("SELECT count(*) FROM series_refs", [], |row| row.get(0))
            .unwrap()
    };
    assert_eq!(refs(&conn), 4);

    assert_eq!(lib.count_orphans().unwrap().shelf, 1);
    assert_eq!(lib.purge_orphans(0).unwrap().shelf, 1);
    assert_eq!(lib.count_orphans().unwrap().shelf, 0);
    // The tagged orphan, the wanted orphan and the MangaDex title stay.
    assert_eq!(refs(&conn), 3);
    lib.scan(None, &|_| {}).unwrap();
    assert_eq!(lib.tags().unwrap()[0].count, 0);
    assert_eq!(lib.want_to_read().unwrap().len(), 1);
}

#[test]
fn the_shelf_survives_a_removed_and_re_added_folder() {
    let fx = scanned();
    let lib = &fx.library;
    let ash = id_of(lib, "Ash");
    lib.tag_series(&[local(ash)], "Kept").unwrap();
    let fav = lib.create_collection("Fav").unwrap();
    lib.add_to_collection(fav.id, &[local(ash)]).unwrap();
    lib.set_want_to_read(&[local(ash)], true).unwrap();

    let root = lib.roots().unwrap()[0].id;
    lib.remove_root(root).unwrap();
    assert!(
        lib.collection_items(fav.id).unwrap().is_empty(),
        "orphans hide"
    );
    assert_eq!(lib.tags().unwrap()[0].count, 0);
    assert!(lib.want_to_read().unwrap().is_empty());

    lib.add_root(&fx.manga).unwrap();
    lib.scan(None, &|_| {}).unwrap();
    let ash = id_of(lib, "Ash");
    assert_eq!(
        lib.collection_items(fav.id).unwrap()[0].series_id,
        Some(ash)
    );
    assert_eq!(lib.tags().unwrap()[0].count, 1);
    assert_eq!(lib.want_to_read().unwrap()[0].series_id, Some(ash));
}

#[test]
fn filters_combine_tags_collections_status_and_source() {
    let fx = scanned();
    let lib = &fx.library;
    let (ash, bloom, cinder) = (id_of(lib, "Ash"), id_of(lib, "Bloom"), id_of(lib, "Cinder"));
    let action = lib
        .tag_series(&[local(ash), local(bloom)], "Action")
        .unwrap();
    let drama = lib
        .tag_series(&[local(bloom), local(cinder)], "Drama")
        .unwrap();
    let fav = lib.create_collection("Fav").unwrap();
    lib.add_to_collection(fav.id, &[local(cinder), remote("x-1", "Remote One")])
        .unwrap();
    lib.tag_series(&[remote("x-1", "Remote One")], "Action")
        .unwrap();
    // Ash: one of two chapters read, so reading. Bloom: finished.
    let first = lib.series_detail(ash).unwrap().unwrap().chapters[0].id;
    lib.record_progress(first, 2).unwrap();
    let only = lib.series_detail(bloom).unwrap().unwrap().chapters[0].id;
    lib.record_progress(only, 2).unwrap();

    let run = |query: FilterQuery| {
        titles(&lib.run_filter(&query, 50).unwrap().items)
            .into_iter()
            .map(str::to_owned)
            .collect::<Vec<_>>()
    };

    assert_eq!(
        run(FilterQuery {
            tags: vec![action.id],
            ..FilterQuery::default()
        }),
        ["Ash", "Bloom", "Remote One"]
    );
    assert_eq!(
        run(FilterQuery {
            tags: vec![action.id, drama.id],
            tag_mode: TagMode::All,
            ..FilterQuery::default()
        }),
        ["Bloom"]
    );
    assert_eq!(
        run(FilterQuery {
            tags: vec![action.id],
            source: Some(SourceFilter::Local),
            exclude_tags: vec![drama.id],
            ..FilterQuery::default()
        }),
        ["Ash"]
    );
    assert_eq!(
        run(FilterQuery {
            collections: vec![fav.id],
            ..FilterQuery::default()
        }),
        ["Cinder", "Remote One"]
    );
    assert_eq!(
        run(FilterQuery {
            source: Some(SourceFilter::MangaDex),
            ..FilterQuery::default()
        }),
        ["Remote One"]
    );
    assert_eq!(
        run(FilterQuery {
            status: vec![ReadStatus::Reading],
            ..FilterQuery::default()
        }),
        ["Ash"]
    );
    assert_eq!(
        run(FilterQuery {
            status: vec![ReadStatus::Unread, ReadStatus::Finished],
            ..FilterQuery::default()
        }),
        ["Bloom", "Cinder"]
    );
    assert_eq!(
        run(FilterQuery {
            min_unread: Some(1),
            sort: FilterSort::Unread,
            ..FilterQuery::default()
        }),
        ["Ash", "Cinder"]
    );
    assert_eq!(
        run(FilterQuery {
            sort: FilterSort::Recent,
            source: Some(SourceFilter::Local),
            ..FilterQuery::default()
        })[2],
        "Cinder",
        "never read goes last"
    );

    let limited = lib.run_filter(&FilterQuery::default(), 2).unwrap();
    assert_eq!(limited.items.len(), 2);
    assert_eq!(limited.total, 4, "the total counts past the limit");
}

#[test]
fn deleting_a_collection_or_tag_rewrites_the_saved_filters() {
    let fx = scanned();
    let lib = &fx.library;
    let ash = id_of(lib, "Ash");
    let tag = lib.tag_series(&[local(ash)], "Gone").unwrap();
    let fav = lib.create_collection("Gone too").unwrap();
    let saved = lib
        .save_filter(
            None,
            "Both",
            &FilterQuery {
                tags: vec![tag.id],
                collections: vec![fav.id],
                ..FilterQuery::default()
            },
            false,
        )
        .unwrap();
    lib.delete_tag(tag.id).unwrap();
    lib.delete_collection(fav.id).unwrap();
    let query = &lib.smart_filters().unwrap()[0].query;
    assert!(query.tags.is_empty() && query.collections.is_empty());

    lib.pin_filter(saved.id, true).unwrap();
    let other = lib
        .save_filter(None, "Second", &FilterQuery::default(), true)
        .unwrap();
    lib.reorder_filters(&[other.id]).unwrap();
    let order: Vec<_> = lib
        .smart_filters()
        .unwrap()
        .into_iter()
        .map(|f| f.name)
        .collect();
    assert_eq!(order, ["Second", "Both"]);
    assert!(lib.smart_filters().unwrap().iter().all(|f| f.pinned));
}

// --- A large library ---------------------------------------------------------

const SERIES: i64 = 5_000;
const CHAPTERS: i64 = 25;

/// 5000 series of 25 chapters, a quarter of them partly read, written
/// straight into the database, with tags on every third series, two
/// collections and Want to Read on every tenth.
fn large(path: &Path) {
    let mut conn = Connection::open(path).unwrap();
    let tx = conn.transaction().unwrap();
    tx.execute(
        "INSERT INTO library_roots (id, path, added_at) VALUES (1, '/m', 0)",
        [],
    )
    .unwrap();
    {
        let mut series = tx
            .prepare(
                "INSERT INTO series (id, root_id, key, ident, path, title, sort_title, language,
                                     added_at, updated_at)
                 VALUES (?1, 1, ?2, ?3, ?4, ?5, lower(?5), ?6, ?7, ?7)",
            )
            .unwrap();
        let mut chapter = tx
            .prepare(
                "INSERT INTO chapters (id, series_id, path, kind, number, sort_order, page_count,
                                       file_size, file_mtime, language, added_at, updated_at)
                 VALUES (?1, ?2, ?3, 'zip', ?4, ?4, 20, 1000, 0, ?5, 0, 0)",
            )
            .unwrap();
        let mut progress = tx
            .prepare(
                "INSERT INTO reading_progress (chapter_id, file_size, page, page_count, completed,
                                               updated_at)
                 VALUES (?1, 1000, 19, 20, 1, ?2)",
            )
            .unwrap();
        for s in 1..=SERIES {
            let lang = if s % 7 == 0 { "pl" } else { "en" };
            series
                .execute(params![
                    s,
                    format!("dir:/m/S{s}"),
                    format!("dir:S{s}"),
                    format!("/m/S{s}"),
                    format!("Series {s:05}"),
                    lang,
                    s * 60_000
                ])
                .unwrap();
            for c in 1..=CHAPTERS {
                let id = s * 100 + c;
                chapter
                    .execute(params![id, s, format!("/m/S{s}/{c}.cbz"), c, lang])
                    .unwrap();
                if s % 4 == 0 && c <= s % 25 {
                    progress.execute(params![id, s * 1000 + c]).unwrap();
                }
            }
        }
    }
    tx.commit().unwrap();
    // As a running app's library would be: written back from the WAL.
    let _: (i64, i64, i64) = conn
        .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .unwrap();
}

fn timed<T>(f: impl FnOnce() -> T) -> (T, Duration) {
    let start = Instant::now();
    let out = f();
    (out, start.elapsed())
}

#[test]
fn filters_stay_fast_and_indexed_on_5000_series() {
    let dir = tempfile::tempdir().unwrap();
    let db = dir.path().join("library.sqlite3");
    drop(Library::open(&db, &dir.path().join("covers")).unwrap());
    large(&db);
    let lib = Library::open(&db, &dir.path().join("covers")).unwrap();

    let every_third: Vec<SeriesRef> = (1..=SERIES).step_by(3).map(local).collect();
    let (tag, tagging) = timed(|| lib.tag_series(&every_third, "Third").unwrap());
    assert_eq!(tag.count, 1667);
    let fav = lib.create_collection("Fav").unwrap();
    let (_, adding) = timed(|| {
        lib.add_to_collection(fav.id, &(1..=500).map(local).collect::<Vec<_>>())
            .unwrap();
    });
    let tenth: Vec<SeriesRef> = (1..=SERIES).step_by(10).map(local).collect();
    lib.set_want_to_read(&tenth, true).unwrap();

    let cases = [
        ("everything by title", FilterQuery::default(), 5000),
        (
            "one tag",
            FilterQuery {
                tags: vec![tag.id],
                ..FilterQuery::default()
            },
            1667,
        ),
        (
            "collection, Polish",
            FilterQuery {
                collections: vec![fav.id],
                languages: vec!["pl".to_owned()],
                ..FilterQuery::default()
            },
            71,
        ),
        (
            "reading, recent first",
            FilterQuery {
                status: vec![ReadStatus::Reading],
                sort: FilterSort::Recent,
                ..FilterQuery::default()
            },
            1200,
        ),
        (
            "at least 20 unread, in Want to Read",
            FilterQuery {
                min_unread: Some(20),
                want_to_read: Some(true),
                ..FilterQuery::default()
            },
            500,
        ),
        (
            "added in the last day",
            FilterQuery {
                added_within_days: Some(1),
                ..FilterQuery::default()
            },
            0,
        ),
    ];
    let mut report = vec![
        format!("tag 1667 series: {tagging:.1?}"),
        format!("add 500 to a collection: {adding:.1?}"),
    ];
    for (name, query, expected) in cases {
        // Warm once, as a Home row is evaluated again on every visit.
        lib.run_filter(&query, 24).unwrap();
        let (result, took) = timed(|| lib.run_filter(&query, 24).unwrap());
        assert_eq!(result.total, expected, "{name}");
        report.push(format!("{name}: {} matches in {took:.1?}", result.total));
        // Generous even for a debug build; a missing index takes seconds.
        assert!(took < Duration::from_millis(1500), "{name} took {took:?}");
    }
    eprintln!("{}", report.join("\n"));

    // The membership lookups go through their indexes, never a table scan.
    let conn = Connection::open(&db).unwrap();
    for sql in [
        "SELECT ref_id FROM series_tags WHERE tag_id IN (1, 2)",
        "SELECT ref_id FROM collection_items WHERE collection_id IN (1)",
        "SELECT id FROM series_refs WHERE series_id = 5",
        "SELECT series_id FROM chapters WHERE language IN ('pl')",
        "SELECT id FROM series WHERE added_at >= 0",
    ] {
        let plan: Vec<String> = conn
            .prepare(&format!("EXPLAIN QUERY PLAN {sql}"))
            .unwrap()
            .query_map([], |row| row.get::<_, String>(3))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert!(
            plan.iter().any(|step| step.contains("USING")),
            "{sql}: {plan:?}"
        );
    }
}
