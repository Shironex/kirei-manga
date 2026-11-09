//! Collections, tags and Want to Read (see `docs/collections.md`).
//!
//! Everything the user organises hangs off a series reference
//! (`series_refs`): a local series by its row and stable identity, or a
//! MangaDex title by its UUID. [`SeriesRef`] is how callers name one; the
//! row is made on first use, so tagging a series or adding a MangaDex title
//! to Want to Read is one call either way.
//!
//! Lists only ever show live references: a local series whose root was
//! removed keeps its tags and memberships as an orphan, hidden, until a scan
//! brings the same series back (see the scanner) and it shows again.

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::filters::FilterQuery;
use crate::{Library, LibraryError, Result, now_ms};

/// The longest name a tag, collection or smart filter may have, in chars.
pub const MAX_NAME_CHARS: usize = 80;

/// How many members [`Collection::preview`] carries, for a cover mosaic.
pub const COLLECTION_PREVIEW: usize = 4;

/// Names a series for the shelf calls: a series of the local library, or a
/// title of an online source that may not be on disk. `title` and
/// `cover_file` (the MangaDex cover file name, so the renderer can ask the
/// cover scheme for it) of a remote title are cached so lists can show it
/// offline; `None` keeps what is stored.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "source")]
pub enum SeriesRef {
    #[serde(rename = "local", rename_all = "camelCase")]
    Local { series_id: i64 },
    #[serde(rename = "mangadex", rename_all = "camelCase")]
    MangaDex {
        remote_id: String,
        #[serde(default)]
        title: Option<String>,
        #[serde(default)]
        cover_file: Option<String>,
    },
}

/// Where a listed series lives.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ItemSource {
    /// On disk, in the local library.
    #[serde(rename = "local")]
    Local,
    /// Known only from MangaDex.
    #[serde(rename = "mangadex")]
    MangaDex,
}

/// One series in a list: a collection, Want to Read or a smart filter's
/// results. A local series is shown from the catalogue by `series_id`; a
/// remote one from `title` and `cover_file`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    /// The reference row, `None` for a local series nothing was organised on
    /// yet (only smart filter results list those).
    pub ref_id: Option<i64>,
    pub series_id: Option<i64>,
    pub source: ItemSource,
    pub remote_id: Option<String>,
    pub title: String,
    pub cover_file: Option<String>,
    /// When it joined the list (for a filter: when the series was added).
    pub added_at: i64,
}

/// A tag with the number of live series that carry it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: i64,
    pub name: String,
    pub position: i64,
    /// Live members.
    pub count: i64,
    /// The member picked as the cover, if any.
    pub cover_ref_id: Option<i64>,
    /// The cover member (picked, else the first) and the next few, in order.
    pub preview: Vec<ShelfItem>,
    pub updated_at: i64,
}

/// A saved smart filter.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SmartFilter {
    pub id: i64,
    pub name: String,
    pub query: FilterQuery,
    /// Shown as a row on Home.
    pub pinned: bool,
    pub position: i64,
    pub updated_at: i64,
}

/// Everything the collections screen, the Home rows and the palette list.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfOverview {
    pub want_count: i64,
    pub collections: Vec<Collection>,
    pub tags: Vec<Tag>,
    pub filters: Vec<SmartFilter>,
}

/// A tag or collection with how many of a selection carry it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Membership {
    pub id: i64,
    pub name: String,
    /// Members of the selection that carry it, 0 to the selection size.
    pub count: i64,
}

/// How a selection of series is organised: what the series page and the
/// bulk edit bar show. Every tag and collection is listed, with 0 for those
/// no selected series has, so the pickers need nothing else.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectionShelf {
    /// Series in the selection.
    pub size: i64,
    /// Of those, how many are in Want to Read.
    pub want_count: i64,
    pub tags: Vec<Membership>,
    pub collections: Vec<Membership>,
}

/// A reference row that still points at something the user can see: a
/// live local series or a remote title.
pub(crate) const LIVE_REF: &str = "(r.series_id IS NOT NULL OR r.remote_id IS NOT NULL)";

/// Columns for [`item_from_row`], over `series_refs r LEFT JOIN series s`;
/// the caller appends the `added_at` column.
const ITEM_COLUMNS: &str =
    "r.id, r.series_id, r.remote_id, coalesce(s.title, r.title, r.remote_id), r.cover_file";

fn item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ShelfItem> {
    let series_id: Option<i64> = row.get(1)?;
    Ok(ShelfItem {
        ref_id: row.get(0)?,
        series_id,
        source: if series_id.is_some() {
            ItemSource::Local
        } else {
            ItemSource::MangaDex
        },
        remote_id: row.get(2)?,
        title: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        cover_file: row.get(4)?,
        added_at: row.get(5)?,
    })
}

/// Trims a user given name and checks it is usable.
fn clean_name(what: &'static str, name: &str) -> Result<String> {
    let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
    if name.is_empty() {
        return Err(LibraryError::InvalidInput(format!("a {what} needs a name")));
    }
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(LibraryError::InvalidInput(format!(
            "a {what} name can be at most {MAX_NAME_CHARS} characters"
        )));
    }
    Ok(name)
}

fn is_unique_violation(error: &rusqlite::Error) -> bool {
    matches!(
        error,
        rusqlite::Error::SqliteFailure(e, _)
            if e.extended_code == rusqlite::ffi::SQLITE_CONSTRAINT_UNIQUE
    )
}

/// The reference row for `series`, made when missing.
pub(crate) fn ensure_ref(conn: &Connection, series: &SeriesRef, now: i64) -> Result<i64> {
    match series {
        SeriesRef::Local { series_id } => {
            let existing = conn
                .prepare_cached("SELECT id FROM series_refs WHERE series_id = ?1")?
                .query_row([series_id], |row| row.get(0))
                .optional()?;
            if let Some(id) = existing {
                return Ok(id);
            }
            conn.prepare_cached(
                "INSERT INTO series_refs (series_id, series_ident, created_at, updated_at)
                 SELECT id, ident, ?2, ?2 FROM series WHERE id = ?1
                 RETURNING id",
            )?
            .query_row(params![series_id, now], |row| row.get(0))
            .optional()?
            .ok_or(LibraryError::NotFound("series", *series_id))
        }
        SeriesRef::MangaDex {
            remote_id,
            title,
            cover_file,
        } => {
            let remote_id = remote_id.trim();
            if remote_id.is_empty() {
                return Err(LibraryError::InvalidInput(
                    "a MangaDex title needs its id".to_owned(),
                ));
            }
            Ok(conn
                .prepare_cached(
                    "INSERT INTO series_refs
                         (source, remote_id, title, cover_file, created_at, updated_at)
                     VALUES ('mangadex', ?1, ?2, ?3, ?4, ?4)
                     ON CONFLICT (source, remote_id) DO UPDATE SET
                         title = coalesce(excluded.title, series_refs.title),
                         cover_file = coalesce(excluded.cover_file, series_refs.cover_file),
                         updated_at = excluded.updated_at
                     RETURNING id",
                )?
                .query_row(params![remote_id, title, cover_file, now], |row| row.get(0))?)
        }
    }
}

/// The reference row for `series` if there is one; never makes it.
fn find_ref(conn: &Connection, series: &SeriesRef) -> Result<Option<i64>> {
    Ok(match series {
        SeriesRef::Local { series_id } => conn
            .prepare_cached("SELECT id FROM series_refs WHERE series_id = ?1")?
            .query_row([series_id], |row| row.get(0))
            .optional()?,
        SeriesRef::MangaDex { remote_id, .. } => conn
            .prepare_cached(
                "SELECT id FROM series_refs WHERE source = 'mangadex' AND remote_id = ?1",
            )?
            .query_row([remote_id.trim()], |row| row.get(0))
            .optional()?,
    })
}

/// A `series_refs` row that holds nothing: no tag, collection, Want to Read
/// or collection cover.
pub(crate) const EMPTY_REF: &str = "series_refs.want_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM series_tags t WHERE t.ref_id = series_refs.id)
    AND NOT EXISTS (SELECT 1 FROM collection_items i WHERE i.ref_id = series_refs.id)
    AND NOT EXISTS (SELECT 1 FROM collections c WHERE c.cover_ref = series_refs.id)";

/// Deletes tags nobody carries and reference rows that hold nothing any
/// more.
fn prune(conn: &Connection) -> Result<()> {
    conn.execute(
        "DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM series_tags t WHERE t.tag_id = tags.id)",
        [],
    )?;
    conn.execute(&format!("DELETE FROM series_refs WHERE {EMPTY_REF}"), [])?;
    Ok(())
}

impl Library {
    // --- Overview ------------------------------------------------------------

    /// Collections, tags, saved filters and the Want to Read count.
    pub fn shelf_overview(&self) -> Result<ShelfOverview> {
        let conn = self.conn();
        let want_count = conn.query_row(
            &format!(
                "SELECT count(*) FROM series_refs r WHERE r.want_at IS NOT NULL AND {LIVE_REF}"
            ),
            [],
            |row| row.get(0),
        )?;
        Ok(ShelfOverview {
            want_count,
            collections: list_collections(&conn)?,
            tags: list_tags(&conn)?,
            filters: crate::filters::list_filters(&conn)?,
        })
    }

    /// Tags, collections and Want to Read for the given series, with how
    /// many of them carry each: one series on its page (local or MangaDex),
    /// or the bulk edit selection.
    pub fn selection_shelf(&self, series: &[SeriesRef]) -> Result<SelectionShelf> {
        let conn = self.conn();
        let mut ref_ids = Vec::with_capacity(series.len());
        for item in series {
            if let Some(id) = find_ref(&conn, item)? {
                ref_ids.push(id);
            }
        }
        let ids = serde_json::to_string(&ref_ids)?;
        let want_count: i64 = conn.query_row(
            "SELECT count(*) FROM series_refs
             WHERE want_at IS NOT NULL AND id IN (SELECT value FROM json_each(?1))",
            [&ids],
            |row| row.get(0),
        )?;
        let memberships = |sql: &str| -> Result<Vec<Membership>> {
            let mut stmt = conn.prepare_cached(sql)?;
            let rows = stmt.query_map([&ids], |row| {
                Ok(Membership {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    count: row.get(2)?,
                })
            })?;
            Ok(rows.collect::<rusqlite::Result<_>>()?)
        };
        let tags = memberships(
            "SELECT g.id, g.name, (SELECT count(*) FROM series_tags t
                 WHERE t.tag_id = g.id AND t.ref_id IN (SELECT value FROM json_each(?1)))
             FROM tags g ORDER BY g.name COLLATE NOCASE, g.id",
        )?;
        let collections = memberships(
            "SELECT c.id, c.name, (SELECT count(*) FROM collection_items i
                 WHERE i.collection_id = c.id AND i.ref_id IN (SELECT value FROM json_each(?1)))
             FROM collections c ORDER BY c.position, c.id",
        )?;
        Ok(SelectionShelf {
            size: i64::try_from(series.len()).unwrap_or(i64::MAX),
            want_count,
            tags,
            collections,
        })
    }

    // --- Want to Read --------------------------------------------------------

    /// Puts series in Want to Read (or takes them out). Adding one that is
    /// already there keeps its place. A MangaDex title gets its reference
    /// made here, which is all the online screens need to call.
    pub fn set_want_to_read(&self, series: &[SeriesRef], want: bool) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        for item in series {
            if want {
                let id = ensure_ref(&tx, item, now)?;
                tx.execute(
                    "UPDATE series_refs SET want_at = coalesce(want_at, ?2), updated_at = ?2
                     WHERE id = ?1",
                    params![id, now],
                )?;
            } else if let Some(id) = find_ref(&tx, item)? {
                tx.execute(
                    "UPDATE series_refs SET want_at = NULL, updated_at = ?2 WHERE id = ?1",
                    params![id, now],
                )?;
            }
        }
        prune(&tx)?;
        tx.commit()?;
        Ok(())
    }

    /// Want to Read, newest first.
    pub fn want_to_read(&self) -> Result<Vec<ShelfItem>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {ITEM_COLUMNS}, r.want_at
             FROM series_refs r LEFT JOIN series s ON s.id = r.series_id
             WHERE r.want_at IS NOT NULL AND {LIVE_REF}
             ORDER BY r.want_at DESC, r.id DESC"
        ))?;
        let rows = stmt.query_map([], item_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    // --- Tags ----------------------------------------------------------------

    /// Every tag with its live use count, by name.
    pub fn tags(&self) -> Result<Vec<Tag>> {
        list_tags(&self.conn())
    }

    /// Puts the tag `name` on every series given, making the tag when no tag
    /// has that name (ignoring case). Returns the tag.
    pub fn tag_series(&self, series: &[SeriesRef], name: &str) -> Result<Tag> {
        let name = clean_name("tag", name)?;
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        let tag_id: i64 = tx.query_row(
            "INSERT INTO tags (name, created_at) VALUES (?1, ?2)
             ON CONFLICT (name) DO UPDATE SET name = tags.name
             RETURNING id",
            params![name, now],
            |row| row.get(0),
        )?;
        let mut tag = tx.prepare_cached(
            "INSERT INTO series_tags (tag_id, ref_id, added_at) VALUES (?1, ?2, ?3)
             ON CONFLICT DO NOTHING",
        )?;
        for item in series {
            let ref_id = ensure_ref(&tx, item, now)?;
            tag.execute(params![tag_id, ref_id, now])?;
        }
        drop(tag);
        let out = tag_by_id(&tx, tag_id)?;
        tx.commit()?;
        Ok(out)
    }

    /// Takes a tag off every series given. A tag left on no series is deleted.
    pub fn untag_series(&self, series: &[SeriesRef], tag_id: i64) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        for item in series {
            if let Some(ref_id) = find_ref(&tx, item)? {
                tx.execute(
                    "DELETE FROM series_tags WHERE tag_id = ?1 AND ref_id = ?2",
                    params![tag_id, ref_id],
                )?;
            }
        }
        prune(&tx)?;
        tx.commit()?;
        Ok(())
    }

    /// Renames a tag. Renaming it to the name of another tag merges the two.
    pub fn rename_tag(&self, tag_id: i64, name: &str) -> Result<Tag> {
        let name = clean_name("tag", name)?;
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let other: Option<i64> = tx
            .query_row(
                "SELECT id FROM tags WHERE name = ?1 AND id <> ?2",
                params![name, tag_id],
                |row| row.get(0),
            )
            .optional()?;
        let kept = match other {
            Some(other) => {
                tx.execute(
                    "INSERT INTO series_tags (tag_id, ref_id, added_at)
                     SELECT ?2, ref_id, added_at FROM series_tags WHERE tag_id = ?1
                     ON CONFLICT DO NOTHING",
                    params![tag_id, other],
                )?;
                tx.execute("DELETE FROM tags WHERE id = ?1", [tag_id])?;
                rewrite_filter_tag(&tx, tag_id, Some(other))?;
                other
            }
            None => {
                if tx.execute(
                    "UPDATE tags SET name = ?2 WHERE id = ?1",
                    params![tag_id, name],
                )? == 0
                {
                    return Err(LibraryError::NotFound("tag", tag_id));
                }
                tag_id
            }
        };
        let out = tag_by_id(&tx, kept)?;
        tx.commit()?;
        Ok(out)
    }

    /// Deletes a tag from every series, and from the saved filters.
    pub fn delete_tag(&self, tag_id: i64) -> Result<bool> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let removed = tx.execute("DELETE FROM tags WHERE id = ?1", [tag_id])? > 0;
        rewrite_filter_tag(&tx, tag_id, None)?;
        prune(&tx)?;
        tx.commit()?;
        Ok(removed)
    }

    // --- Collections ---------------------------------------------------------

    /// Every collection in the user's order.
    pub fn collections(&self) -> Result<Vec<Collection>> {
        list_collections(&self.conn())
    }

    /// Makes an empty collection at the end of the list.
    pub fn create_collection(&self, name: &str) -> Result<Collection> {
        let name = clean_name("collection", name)?;
        let conn = self.conn();
        let now = now_ms();
        let id: i64 = conn
            .query_row(
                "INSERT INTO collections (name, position, created_at, updated_at)
                 VALUES (?1, (SELECT coalesce(max(position), -1) + 1 FROM collections), ?2, ?2)
                 RETURNING id",
                params![name, now],
                |row| row.get(0),
            )
            .map_err(|error| collection_name_error(error, &name))?;
        collection_by_id(&conn, id)
    }

    pub fn rename_collection(&self, id: i64, name: &str) -> Result<Collection> {
        let name = clean_name("collection", name)?;
        let conn = self.conn();
        let changed = conn
            .execute(
                "UPDATE collections SET name = ?2, updated_at = ?3 WHERE id = ?1",
                params![id, name, now_ms()],
            )
            .map_err(|error| collection_name_error(error, &name))?;
        if changed == 0 {
            return Err(LibraryError::NotFound("collection", id));
        }
        collection_by_id(&conn, id)
    }

    /// Deletes a collection. Its series stay in the library and keep their
    /// other lists; saved filters forget it.
    pub fn delete_collection(&self, id: i64) -> Result<bool> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let removed = tx.execute("DELETE FROM collections WHERE id = ?1", [id])? > 0;
        rewrite_filter_collection(&tx, id)?;
        renumber(&tx, Ordered::Collections)?;
        prune(&tx)?;
        tx.commit()?;
        Ok(removed)
    }

    /// Puts the collections in the order given. Ids left out keep their
    /// relative order after the ones given.
    pub fn reorder_collections(&self, ids: &[i64]) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        apply_order(&tx, Ordered::Collections, ids)?;
        tx.commit()?;
        Ok(())
    }

    /// Picks the member whose cover stands for the collection; `None` goes
    /// back to the first member.
    pub fn set_collection_cover(&self, id: i64, ref_id: Option<i64>) -> Result<Collection> {
        let conn = self.conn();
        if let Some(ref_id) = ref_id {
            let member: bool = conn.query_row(
                "SELECT EXISTS (SELECT 1 FROM collection_items
                                WHERE collection_id = ?1 AND ref_id = ?2)",
                params![id, ref_id],
                |row| row.get(0),
            )?;
            if !member {
                return Err(LibraryError::NotFound("collection member", ref_id));
            }
        }
        let changed = conn.execute(
            "UPDATE collections SET cover_ref = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, ref_id, now_ms()],
        )?;
        if changed == 0 {
            return Err(LibraryError::NotFound("collection", id));
        }
        collection_by_id(&conn, id)
    }

    /// The members of a collection in the user's order.
    pub fn collection_items(&self, id: i64) -> Result<Vec<ShelfItem>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT {ITEM_COLUMNS}, i.added_at
             FROM collection_items i
             JOIN series_refs r ON r.id = i.ref_id
             LEFT JOIN series s ON s.id = r.series_id
             WHERE i.collection_id = ?1 AND {LIVE_REF}
             ORDER BY i.position, i.added_at"
        ))?;
        let rows = stmt.query_map([id], item_from_row)?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Adds series to the end of a collection, in the order given. Members
    /// already there keep their place.
    pub fn add_to_collection(&self, id: i64, series: &[SeriesRef]) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let now = now_ms();
        if tx.execute(
            "UPDATE collections SET updated_at = ?2 WHERE id = ?1",
            params![id, now],
        )? == 0
        {
            return Err(LibraryError::NotFound("collection", id));
        }
        let mut add = tx.prepare_cached(
            "INSERT INTO collection_items (collection_id, ref_id, position, added_at)
             VALUES (?1, ?2, (SELECT coalesce(max(position), -1) + 1 FROM collection_items
                              WHERE collection_id = ?1), ?3)
             ON CONFLICT DO NOTHING",
        )?;
        for item in series {
            let ref_id = ensure_ref(&tx, item, now)?;
            add.execute(params![id, ref_id, now])?;
        }
        drop(add);
        tx.commit()?;
        Ok(())
    }

    /// Takes series out of a collection; the rest close up.
    pub fn remove_from_collection(&self, id: i64, series: &[SeriesRef]) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        for item in series {
            if let Some(ref_id) = find_ref(&tx, item)? {
                tx.execute(
                    "DELETE FROM collection_items WHERE collection_id = ?1 AND ref_id = ?2",
                    params![id, ref_id],
                )?;
                tx.execute(
                    "UPDATE collections SET cover_ref = NULL WHERE id = ?1 AND cover_ref = ?2",
                    params![id, ref_id],
                )?;
            }
        }
        tx.execute(
            "UPDATE collections SET updated_at = ?2 WHERE id = ?1",
            params![id, now_ms()],
        )?;
        renumber(&tx, Ordered::Members(id))?;
        prune(&tx)?;
        tx.commit()?;
        Ok(())
    }

    /// Puts the members of a collection in the order of `ref_ids`. Members
    /// left out keep their relative order after the ones given.
    pub fn reorder_collection(&self, id: i64, ref_ids: &[i64]) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        apply_order(&tx, Ordered::Members(id), ref_ids)?;
        tx.execute(
            "UPDATE collections SET updated_at = ?2 WHERE id = ?1",
            params![id, now_ms()],
        )?;
        tx.commit()?;
        Ok(())
    }
}

fn collection_name_error(error: rusqlite::Error, name: &str) -> LibraryError {
    if is_unique_violation(&error) {
        LibraryError::InvalidInput(format!("there is already a collection named {name}"))
    } else {
        error.into()
    }
}

fn list_tags(conn: &Connection) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT g.id, g.name, (SELECT count(*) FROM series_tags t
             JOIN series_refs r ON r.id = t.ref_id WHERE t.tag_id = g.id AND {LIVE_REF})
         FROM tags g ORDER BY g.name COLLATE NOCASE, g.id"
    ))?;
    let rows = stmt.query_map([], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            count: row.get(2)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

fn tag_by_id(conn: &Connection, id: i64) -> Result<Tag> {
    list_tags(conn)?
        .into_iter()
        .find(|t| t.id == id)
        .ok_or(LibraryError::NotFound("tag", id))
}

fn list_collections(conn: &Connection) -> Result<Vec<Collection>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT c.id, c.name, c.position, c.cover_ref, c.updated_at,
                (SELECT count(*) FROM collection_items i JOIN series_refs r ON r.id = i.ref_id
                 WHERE i.collection_id = c.id AND {LIVE_REF})
         FROM collections c ORDER BY c.position, c.id"
    ))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Collection {
                id: row.get(0)?,
                name: row.get(1)?,
                position: row.get(2)?,
                cover_ref_id: row.get(3)?,
                updated_at: row.get(4)?,
                count: row.get(5)?,
                preview: Vec::new(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    let mut preview = conn.prepare_cached(&format!(
        "SELECT {ITEM_COLUMNS}, i.added_at
         FROM collection_items i
         JOIN series_refs r ON r.id = i.ref_id
         LEFT JOIN series s ON s.id = r.series_id
         WHERE i.collection_id = ?1 AND {LIVE_REF}
         ORDER BY i.ref_id IS NOT ?2, i.position, i.added_at
         LIMIT {COLLECTION_PREVIEW}"
    ))?;
    let mut out = rows;
    for collection in &mut out {
        collection.preview = preview
            .query_map(
                params![collection.id, collection.cover_ref_id],
                item_from_row,
            )?
            .collect::<rusqlite::Result<_>>()?;
    }
    Ok(out)
}

fn collection_by_id(conn: &Connection, id: i64) -> Result<Collection> {
    list_collections(conn)?
        .into_iter()
        .find(|c| c.id == id)
        .ok_or(LibraryError::NotFound("collection", id))
}

/// One of the tables kept in a user order. Only these fixed names are
/// spliced into SQL.
#[derive(Clone, Copy)]
enum Ordered {
    Collections,
    /// The members of one collection.
    Members(i64),
}

impl Ordered {
    /// The ids in their current order.
    fn current(self, conn: &Connection) -> Result<Vec<i64>> {
        let rows = match self {
            Self::Collections => conn
                .prepare_cached("SELECT id FROM collections ORDER BY position, id")?
                .query_map([], |row| row.get(0))?
                .collect::<rusqlite::Result<_>>()?,
            Self::Members(id) => conn
                .prepare_cached(
                    "SELECT ref_id FROM collection_items WHERE collection_id = ?1
                     ORDER BY position, added_at, ref_id",
                )?
                .query_map([id], |row| row.get(0))?
                .collect::<rusqlite::Result<_>>()?,
        };
        Ok(rows)
    }

    /// Writes positions 0, 1, 2 in the order of `ids`.
    fn write(self, conn: &Connection, ids: &[i64]) -> Result<()> {
        for (index, id) in ids.iter().enumerate() {
            let index = i64::try_from(index).unwrap_or(i64::MAX);
            match self {
                Self::Collections => conn
                    .prepare_cached("UPDATE collections SET position = ?2 WHERE id = ?1")?
                    .execute(params![id, index])?,
                Self::Members(collection) => conn
                    .prepare_cached(
                        "UPDATE collection_items SET position = ?3
                         WHERE collection_id = ?1 AND ref_id = ?2",
                    )?
                    .execute(params![collection, id, index])?,
            };
        }
        Ok(())
    }
}

/// Puts the ids given first, in that order, and the rest after them in
/// their old order. Unknown ids are ignored.
fn apply_order(conn: &Connection, table: Ordered, ids: &[i64]) -> Result<()> {
    let current = table.current(conn)?;
    let mut order: Vec<i64> = Vec::with_capacity(current.len());
    for id in ids {
        if current.contains(id) && !order.contains(id) {
            order.push(*id);
        }
    }
    order.extend(current.iter().filter(|id| !ids.contains(id)));
    table.write(conn, &order)
}

/// Closes gaps so positions run 0, 1, 2 in the current order.
fn renumber(conn: &Connection, table: Ordered) -> Result<()> {
    let current = table.current(conn)?;
    table.write(conn, &current)
}

/// Saved filters that named a deleted (or merged) tag follow it.
fn rewrite_filter_tag(conn: &Connection, tag_id: i64, into: Option<i64>) -> Result<()> {
    crate::filters::rewrite_filters(conn, |query| query.replace_tag(tag_id, into))
}

/// Saved filters forget a deleted collection.
fn rewrite_filter_collection(conn: &Connection, id: i64) -> Result<()> {
    crate::filters::rewrite_filters(conn, |query| query.remove_collection(id))
}
