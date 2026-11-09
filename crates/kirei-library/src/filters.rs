//! Smart filters: a typed query over the library and the shelf lists,
//! saved by name and pinnable to Home (see `docs/collections.md`).
//!
//! A [`FilterQuery`] is never run as text. [`compile`] turns it into one SQL
//! statement with every value bound as a parameter, so filters evaluate in
//! SQLite with its indexes and the renderer gets back only the rows a Home
//! row or a results page shows.
//!
//! Local series and MangaDex titles are listed together. Criteria only a
//! local series can meet (read status, unread chapters, language) leave
//! remote titles out.

use rusqlite::types::Value;
use rusqlite::{Connection, OptionalExtension, params, params_from_iter};
use serde::{Deserialize, Serialize};

use crate::collections::{ItemSource, MAX_NAME_CHARS, ShelfItem, SmartFilter};
use crate::{Library, LibraryError, Result, now_ms};

/// The most rows one evaluation returns.
pub const MAX_FILTER_ROWS: u32 = 10_000;

/// How a filter combines its tags.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TagMode {
    /// A series with any of the tags matches.
    #[default]
    Any,
    /// A series needs every tag.
    All,
}

/// Reading state, the same rules as the library grid: finished when every
/// chapter on disk is read, unread when nothing was ever opened, else
/// reading.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ReadStatus {
    Unread,
    Reading,
    Finished,
}

/// Where a series comes from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SourceFilter {
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "mangadex")]
    MangaDex,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FilterSort {
    /// Title, A to Z.
    #[default]
    Title,
    /// Newest in the library first.
    Added,
    /// Most recently read first; never read last.
    Recent,
    /// Most unread chapters first.
    Unread,
}

/// A smart filter. Every criterion is optional and they all have to hold;
/// lists inside one criterion are alternatives (except tags in `All` mode).
/// Unknown fields are ignored and missing ones take their default, so a
/// filter saved by a newer build still opens.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FilterQuery {
    pub tags: Vec<i64>,
    pub tag_mode: TagMode,
    /// Series with any of these tags are left out.
    pub exclude_tags: Vec<i64>,
    /// In any of these collections.
    pub collections: Vec<i64>,
    /// `Some(true)` only Want to Read, `Some(false)` none of it.
    pub want_to_read: Option<bool>,
    /// Any of these reading states.
    pub status: Vec<ReadStatus>,
    /// At least this many unread chapters on disk.
    pub min_unread: Option<i64>,
    /// The series or one of its chapters is in any of these languages, as
    /// the files name them (see [`Library::languages`]).
    pub languages: Vec<String>,
    pub source: Option<SourceFilter>,
    /// Added to the library (or to a list, for a remote title) in the last
    /// so many days.
    pub added_within_days: Option<u32>,
    pub sort: FilterSort,
}

impl FilterQuery {
    /// True when a remote title can never match, because a criterion needs
    /// files on disk.
    fn local_only(&self) -> bool {
        !self.status.is_empty() || self.min_unread.is_some() || !self.languages.is_empty()
    }

    /// Needs the per-series chapter and progress counts.
    fn needs_counts(&self) -> bool {
        !self.status.is_empty()
            || self.min_unread.is_some()
            || matches!(self.sort, FilterSort::Recent | FilterSort::Unread)
    }

    /// Swaps a tag for another (`Some`) or drops it (`None`). True when the
    /// query changed.
    pub(crate) fn replace_tag(&mut self, tag: i64, into: Option<i64>) -> bool {
        let mut changed = false;
        for list in [&mut self.tags, &mut self.exclude_tags] {
            if list.contains(&tag) {
                list.retain(|t| *t != tag);
                if let Some(into) = into
                    && !list.contains(&into)
                {
                    list.push(into);
                }
                changed = true;
            }
        }
        changed
    }

    /// Drops a collection. True when the query changed.
    pub(crate) fn remove_collection(&mut self, id: i64) -> bool {
        let before = self.collections.len();
        self.collections.retain(|c| *c != id);
        before != self.collections.len()
    }
}

/// What a filter found: the first rows in its order and how many match.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterResult {
    pub items: Vec<ShelfItem>,
    pub total: i64,
}

/// Sorted, deduplicated copy, so `All` can compare counts.
fn distinct(ids: &[i64]) -> Vec<i64> {
    let mut out = ids.to_vec();
    out.sort_unstable();
    out.dedup();
    out
}

/// Appends `?, ?, ?` for `values` to `sql` and their values to `params`.
fn push_list<T: Clone + Into<Value>>(sql: &mut String, params: &mut Vec<Value>, values: &[T]) {
    for (i, value) in values.iter().enumerate() {
        if i > 0 {
            sql.push_str(", ");
        }
        sql.push('?');
        params.push(value.clone().into());
    }
}

/// Conditions on the reference row `r` (tags, collections, Want to Read),
/// shared by the local and the remote half.
fn ref_conditions(query: &FilterQuery, conds: &mut Vec<String>, params: &mut Vec<Value>) {
    let tags = distinct(&query.tags);
    if !tags.is_empty() {
        let mut sql = String::from("r.id IN (SELECT ref_id FROM series_tags WHERE tag_id IN (");
        push_list(&mut sql, params, &tags);
        sql.push(')');
        if query.tag_mode == TagMode::All && tags.len() > 1 {
            sql.push_str(" GROUP BY ref_id HAVING count(*) = ?");
            params.push(Value::Integer(
                i64::try_from(tags.len()).unwrap_or(i64::MAX),
            ));
        }
        sql.push(')');
        conds.push(sql);
    }
    let exclude = distinct(&query.exclude_tags);
    if !exclude.is_empty() {
        let mut sql = String::from(
            "(r.id IS NULL OR r.id NOT IN (SELECT ref_id FROM series_tags WHERE tag_id IN (",
        );
        push_list(&mut sql, params, &exclude);
        sql.push_str(")))");
        conds.push(sql);
    }
    let collections = distinct(&query.collections);
    if !collections.is_empty() {
        let mut sql =
            String::from("r.id IN (SELECT ref_id FROM collection_items WHERE collection_id IN (");
        push_list(&mut sql, params, &collections);
        sql.push_str("))");
        conds.push(sql);
    }
    match query.want_to_read {
        Some(true) => conds.push("r.want_at IS NOT NULL".to_owned()),
        Some(false) => conds.push("r.want_at IS NULL".to_owned()),
        None => {}
    }
}

fn status_condition(status: ReadStatus) -> &'static str {
    const UNREAD: &str = "(coalesce(a.done, 0) = 0 AND a.last_read IS NULL)";
    const FINISHED: &str = "(coalesce(a.present, 0) > 0 AND a.done >= a.present)";
    match status {
        ReadStatus::Unread => UNREAD,
        ReadStatus::Finished => FINISHED,
        ReadStatus::Reading => {
            "(NOT (coalesce(a.done, 0) = 0 AND a.last_read IS NULL)
              AND NOT (coalesce(a.present, 0) > 0 AND a.done >= a.present))"
        }
    }
}

/// Per series counts, the same as the catalogue's: chapters on disk, read
/// chapters, unread chapters on disk, last read time. Presence is counted
/// from the `chapters_presence` index alone, and progress from its own rows
/// (usually far fewer than chapters); the CROSS JOIN keeps SQLite driving
/// from them rather than probing progress once per chapter.
const COUNTS: &str = "counts AS (
    SELECT t.series_id, t.present, coalesce(d.done, 0) AS done,
           t.present - coalesce(d.done_present, 0) AS unread, d.last_read
    FROM (SELECT series_id, sum(missing = 0) AS present FROM chapters GROUP BY series_id) t
    LEFT JOIN (SELECT c.series_id, sum(p.completed) AS done,
                      sum(p.completed AND c.missing = 0) AS done_present,
                      max(p.updated_at) AS last_read
               FROM reading_progress p CROSS JOIN chapters c ON c.id = p.chapter_id
               GROUP BY c.series_id) d ON d.series_id = t.series_id)";

/// The statement and its parameters for `query` at time `now`, returning at
/// most `limit` rows. Columns: ref id, series id, remote id, title, cover
/// url, added at, total.
pub(crate) fn compile(query: &FilterQuery, now: i64, limit: u32) -> (String, Vec<Value>) {
    let counts = query.needs_counts();
    let added_since = query
        .added_within_days
        .map(|days| now - i64::from(days) * 86_400_000);
    let mut params: Vec<Value> = Vec::new();
    let mut parts: Vec<String> = Vec::new();

    if query.source != Some(SourceFilter::MangaDex) {
        let mut conds: Vec<String> = Vec::new();
        ref_conditions(query, &mut conds, &mut params);
        if !query.status.is_empty() {
            let any: Vec<&str> = query.status.iter().map(|s| status_condition(*s)).collect();
            conds.push(format!("({})", any.join(" OR ")));
        }
        if let Some(min) = query.min_unread {
            conds.push("coalesce(a.unread, 0) >= ?".to_owned());
            params.push(Value::Integer(min));
        }
        if !query.languages.is_empty() {
            let mut series = String::from("(s.language IN (");
            push_list(&mut series, &mut params, &query.languages);
            series.push_str(") OR s.id IN (SELECT series_id FROM chapters WHERE language IN (");
            push_list(&mut series, &mut params, &query.languages);
            series.push_str(")))");
            conds.push(series);
        }
        if let Some(since) = added_since {
            conds.push("s.added_at >= ?".to_owned());
            params.push(Value::Integer(since));
        }
        let (last_read, unread, join) = if counts {
            (
                "a.last_read",
                "coalesce(a.unread, 0)",
                " LEFT JOIN counts a ON a.series_id = s.id",
            )
        } else {
            ("NULL", "0", "")
        };
        parts.push(format!(
            "SELECT r.id AS ref_id, s.id AS series_id, r.remote_id AS remote_id,
                    s.title AS title, r.cover_file AS cover_file, s.added_at AS added_at,
                    s.sort_title AS sort_key, {last_read} AS last_read, {unread} AS unread
             FROM series s LEFT JOIN series_refs r ON r.series_id = s.id{join}{}",
            where_clause(&conds)
        ));
    }

    if query.source != Some(SourceFilter::Local) && !query.local_only() {
        let mut conds: Vec<String> = vec![
            "r.series_id IS NULL".to_owned(),
            "r.remote_id IS NOT NULL".to_owned(),
        ];
        ref_conditions(query, &mut conds, &mut params);
        if let Some(since) = added_since {
            conds.push("r.created_at >= ?".to_owned());
            params.push(Value::Integer(since));
        }
        parts.push(format!(
            "SELECT r.id AS ref_id, NULL AS series_id, r.remote_id AS remote_id,
                    coalesce(r.title, r.remote_id) AS title, r.cover_file AS cover_file,
                    r.created_at AS added_at, lower(coalesce(r.title, r.remote_id)) AS sort_key,
                    NULL AS last_read, 0 AS unread
             FROM series_refs r{}",
            where_clause(&conds)
        ));
    }

    if parts.is_empty() {
        // A source and a criterion that exclude each other.
        return (
            "SELECT NULL, NULL, NULL, '', NULL, 0, 0 WHERE 0".to_owned(),
            Vec::new(),
        );
    }

    let order = match query.sort {
        FilterSort::Title => "sort_key, series_id, ref_id",
        FilterSort::Added => "added_at DESC, series_id DESC, ref_id DESC",
        FilterSort::Recent => "last_read DESC NULLS LAST, sort_key, series_id, ref_id",
        FilterSort::Unread => "unread DESC, sort_key, series_id, ref_id",
    };
    let with = if counts {
        format!("WITH {COUNTS} ")
    } else {
        String::new()
    };
    params.push(Value::Integer(i64::from(limit.min(MAX_FILTER_ROWS))));
    (
        format!(
            "{with}SELECT ref_id, series_id, remote_id, title, cover_file, added_at,
                    count(*) OVER () AS total
             FROM ({}) ORDER BY {order} LIMIT ?",
            parts.join(" UNION ALL ")
        ),
        params,
    )
}

fn where_clause(conds: &[String]) -> String {
    if conds.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", conds.join(" AND "))
    }
}

/// Every saved filter in the user's order.
pub(crate) fn list_filters(conn: &Connection) -> Result<Vec<SmartFilter>> {
    let mut stmt = conn.prepare_cached(
        "SELECT id, name, query, pinned, position, updated_at
         FROM smart_filters ORDER BY position, id",
    )?;
    let rows = stmt.query_map([], |row| {
        let query: String = row.get(2)?;
        Ok(SmartFilter {
            id: row.get(0)?,
            name: row.get(1)?,
            // A query this build cannot read shows as matching everything
            // rather than hiding the filter; saving it again rewrites it.
            query: serde_json::from_str(&query).unwrap_or_default(),
            pinned: row.get(3)?,
            position: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

/// Applies `edit` to every saved query and stores the ones it changed.
pub(crate) fn rewrite_filters(
    conn: &Connection,
    edit: impl Fn(&mut FilterQuery) -> bool,
) -> Result<()> {
    for mut filter in list_filters(conn)? {
        if edit(&mut filter.query) {
            conn.execute(
                "UPDATE smart_filters SET query = ?2, updated_at = ?3 WHERE id = ?1",
                params![filter.id, serde_json::to_string(&filter.query)?, now_ms()],
            )?;
        }
    }
    Ok(())
}

impl Library {
    /// Runs a filter and returns its first `limit` rows (capped at
    /// [`MAX_FILTER_ROWS`]) with the total match count.
    pub fn run_filter(&self, query: &FilterQuery, limit: u32) -> Result<FilterResult> {
        let (sql, values) = compile(query, now_ms(), limit);
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(&sql)?;
        let mut total = 0;
        let items = stmt
            .query_map(params_from_iter(values), |row| {
                total = row.get(6)?;
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
                    title: row.get(3)?,
                    cover_file: row.get(4)?,
                    added_at: row.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(FilterResult { items, total })
    }

    /// Every saved filter in the user's order.
    pub fn smart_filters(&self) -> Result<Vec<SmartFilter>> {
        list_filters(&self.conn())
    }

    /// Saves a new filter (`id` `None`, placed last) or replaces one.
    pub fn save_filter(
        &self,
        id: Option<i64>,
        name: &str,
        query: &FilterQuery,
        pinned: bool,
    ) -> Result<SmartFilter> {
        let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
        if name.is_empty() || name.chars().count() > MAX_NAME_CHARS {
            return Err(LibraryError::InvalidInput(format!(
                "a smart filter needs a name of 1 to {MAX_NAME_CHARS} characters"
            )));
        }
        let text = serde_json::to_string(query)?;
        let conn = self.conn();
        let now = now_ms();
        let saved: i64 = match id {
            Some(id) => conn
                .query_row(
                    "UPDATE smart_filters SET name = ?2, query = ?3, pinned = ?4, updated_at = ?5
                     WHERE id = ?1 RETURNING id",
                    params![id, name, text, pinned, now],
                    |row| row.get(0),
                )
                .optional()?
                .ok_or(LibraryError::NotFound("smart filter", id))?,
            None => conn.query_row(
                "INSERT INTO smart_filters (name, query, pinned, position, created_at, updated_at)
                 VALUES (?1, ?2, ?3, (SELECT coalesce(max(position), -1) + 1 FROM smart_filters),
                         ?4, ?4)
                 RETURNING id",
                params![name, text, pinned, now],
                |row| row.get(0),
            )?,
        };
        list_filters(&conn)?
            .into_iter()
            .find(|f| f.id == saved)
            .ok_or(LibraryError::NotFound("smart filter", saved))
    }

    /// Pins a filter to Home or unpins it.
    pub fn pin_filter(&self, id: i64, pinned: bool) -> Result<()> {
        let changed = self.conn().execute(
            "UPDATE smart_filters SET pinned = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, pinned, now_ms()],
        )?;
        if changed == 0 {
            return Err(LibraryError::NotFound("smart filter", id));
        }
        Ok(())
    }

    pub fn delete_filter(&self, id: i64) -> Result<bool> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let removed = tx.execute("DELETE FROM smart_filters WHERE id = ?1", [id])? > 0;
        let ids: Vec<i64> = tx
            .prepare("SELECT id FROM smart_filters ORDER BY position, id")?
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        write_filter_order(&tx, &ids)?;
        tx.commit()?;
        Ok(removed)
    }

    /// Puts the filters in the order given (the Home rows follow it). Ids
    /// left out keep their relative order after the ones given.
    pub fn reorder_filters(&self, ids: &[i64]) -> Result<()> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let current: Vec<i64> = tx
            .prepare("SELECT id FROM smart_filters ORDER BY position, id")?
            .query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?;
        let mut order: Vec<i64> = Vec::with_capacity(current.len());
        for id in ids {
            if current.contains(id) && !order.contains(id) {
                order.push(*id);
            }
        }
        order.extend(current.iter().filter(|id| !ids.contains(id)));
        write_filter_order(&tx, &order)?;
        tx.commit()?;
        Ok(())
    }

    /// The languages the library's files name, for the filter builder:
    /// series and chapter languages, most used first.
    pub fn languages(&self) -> Result<Vec<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare_cached(
            "SELECT language FROM (
                 SELECT language FROM series WHERE language IS NOT NULL AND language <> ''
                 UNION ALL
                 SELECT language FROM chapters WHERE language IS NOT NULL AND language <> '')
             GROUP BY language ORDER BY count(*) DESC, language",
        )?;
        let rows = stmt.query_map([], |row| row.get(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }
}

fn write_filter_order(conn: &Connection, ids: &[i64]) -> Result<()> {
    let mut stmt = conn.prepare_cached("UPDATE smart_filters SET position = ?2 WHERE id = ?1")?;
    for (index, id) in ids.iter().enumerate() {
        stmt.execute(params![id, i64::try_from(index).unwrap_or(i64::MAX)])?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_empty_query_lists_everything_by_title_without_counts() {
        let (sql, params) = compile(&FilterQuery::default(), 0, 10);
        assert!(!sql.contains("counts"));
        assert!(sql.contains("UNION ALL"));
        assert_eq!(params, vec![Value::Integer(10)]);
    }

    #[test]
    fn every_value_is_bound_never_spliced() {
        let query = FilterQuery {
            languages: vec!["en'; DROP TABLE series; --".to_owned()],
            ..FilterQuery::default()
        };
        let (sql, params) = compile(&query, 0, 10);
        assert!(!sql.contains("DROP"));
        assert!(params.contains(&Value::Text("en'; DROP TABLE series; --".to_owned())));
    }

    #[test]
    fn local_only_criteria_drop_remote_titles() {
        let query = FilterQuery {
            min_unread: Some(1),
            ..FilterQuery::default()
        };
        let (sql, _) = compile(&query, 0, 10);
        assert!(!sql.contains("UNION ALL"));
        assert!(sql.contains("counts"));
    }

    #[test]
    fn a_mangadex_only_filter_with_local_criteria_is_empty() {
        let query = FilterQuery {
            source: Some(SourceFilter::MangaDex),
            status: vec![ReadStatus::Unread],
            ..FilterQuery::default()
        };
        let (sql, params) = compile(&query, 0, 10);
        assert!(sql.ends_with("WHERE 0"));
        assert!(params.is_empty());
    }

    #[test]
    fn queries_read_missing_and_unknown_fields() {
        let query: FilterQuery =
            serde_json::from_str(r#"{"tags":[3],"tagMode":"all","futureField":1}"#).unwrap();
        assert_eq!(query.tags, vec![3]);
        assert_eq!(query.tag_mode, TagMode::All);
        assert_eq!(query.sort, FilterSort::Title);
    }

    #[test]
    fn a_merged_tag_is_swapped_in_the_query() {
        let mut query = FilterQuery {
            tags: vec![1, 2],
            exclude_tags: vec![1],
            ..FilterQuery::default()
        };
        assert!(query.replace_tag(1, Some(2)));
        assert_eq!(query.tags, vec![2]);
        assert_eq!(query.exclude_tags, vec![2]);
        assert!(!query.replace_tag(9, None));
    }
}
