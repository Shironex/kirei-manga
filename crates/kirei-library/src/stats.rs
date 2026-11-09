//! Reading sessions and the stats built from them (see `docs/stats.md`).
//!
//! Sessions are written from the same progress events that save the page
//! ([`Library::record_reading`]), so the reader needs no timer of its own:
//!
//! - An event within [`IDLE_CUTOFF_MS`] of the open session, on the same
//!   series, extends it and adds the gap to its active time. A longer pause,
//!   another series or the first event after a launch starts a new session;
//!   the pause itself counts for nothing.
//! - A session never crosses local midnight. When a gap does, the time up to
//!   midnight goes to the old session and the rest to a new one on the next
//!   day, so daily totals and streaks are exact.
//! - The local day is fixed when the event is recorded, from the UTC offset
//!   the reader reports, so travelling later never moves past days around.
//!
//! Everything stays in the library database: nothing is sent anywhere, and a
//! backup carries the sessions with the rest of the data.

use rusqlite::{Connection, OptionalExtension, params};
use serde::Serialize;

use crate::civil::{DAY_MS, civil_from_days, days_from_civil, iso_date};
use crate::{CoverRef, Library, ReadingProgress, Result, now_ms, upsert_progress};

/// A pause longer than this ends a session; shorter gaps count as reading.
pub const IDLE_CUTOFF_MS: i64 = 5 * 60_000;

/// UTC offsets run from -12:00 to +14:00; anything outside is clamped.
pub const MAX_UTC_OFFSET_MIN: i32 = 14 * 60;

/// How many series [`ReadingStats::top_series`] lists.
pub const TOP_SERIES: usize = 5;

/// When a progress event happened, and the reader's UTC offset at that
/// moment (minutes east of UTC, so UTC+2 is 120).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReadingClock {
    pub now_ms: i64,
    pub utc_offset_min: i32,
}

impl ReadingClock {
    /// The current time with the given offset.
    pub fn now(utc_offset_min: i32) -> Self {
        Self::at(now_ms(), utc_offset_min)
    }

    /// A fixed time, for tests and imports. The offset is clamped.
    pub fn at(now_ms: i64, utc_offset_min: i32) -> Self {
        Self {
            now_ms,
            utc_offset_min: utc_offset_min.clamp(-MAX_UTC_OFFSET_MIN, MAX_UTC_OFFSET_MIN),
        }
    }

    /// The local calendar day of this moment.
    pub fn day(&self) -> i64 {
        local_day(self.now_ms, self.utc_offset_min)
    }
}

/// Local calendar day (days since 1970-01-01) of a UTC instant.
pub fn local_day(ms: i64, utc_offset_min: i32) -> i64 {
    (ms + i64::from(utc_offset_min) * 60_000).div_euclid(DAY_MS)
}

/// The UTC instant a local day starts at.
fn day_start(day: i64, utc_offset_min: i32) -> i64 {
    day * DAY_MS - i64::from(utc_offset_min) * 60_000
}

/// Sums over a set of sessions.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingTotals {
    pub active_ms: i64,
    pub sessions: i64,
    pub pages_turned: i64,
    pub chapters_finished: i64,
    pub days_read: i64,
    pub series_read: i64,
}

/// A run of consecutive days with reading. `days` is 0 (and the dates
/// `None`) when there is none.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Streak {
    pub days: i64,
    /// First day, `YYYY-MM-DD`.
    pub start: Option<String>,
    /// Last day, `YYYY-MM-DD`.
    pub end: Option<String>,
}

/// One local day with reading.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingDay {
    /// `YYYY-MM-DD`.
    pub date: String,
    pub active_ms: i64,
    pub pages_turned: i64,
    pub chapters_finished: i64,
    pub sessions: i64,
}

/// One series and the reading it got.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesReading {
    /// The live series, when it is still in the library.
    pub series_id: Option<i64>,
    pub title: String,
    pub cover: Option<CoverRef>,
    pub active_ms: i64,
    pub pages_turned: i64,
    pub chapters_finished: i64,
    pub sessions: i64,
    pub days_read: i64,
}

/// Everything the stats page and the year in review card show.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingStats {
    /// The year the `year*`, `days`, `months` and `top_series` fields cover.
    pub year: i64,
    /// Today in the reader's time zone, `YYYY-MM-DD`.
    pub today: String,
    /// Years with any reading, newest first; always holds the current year.
    pub years: Vec<i64>,
    pub all_time: ReadingTotals,
    pub year_totals: ReadingTotals,
    /// The run ending today, or yesterday when today has no reading yet.
    pub current_streak: Streak,
    pub longest_streak: Streak,
    /// The longest run inside `year`.
    pub year_longest_streak: Streak,
    /// Days of `year` with reading, oldest first.
    pub days: Vec<ReadingDay>,
    /// Active time per month of `year`, January first.
    pub months: Vec<i64>,
    /// Series read most in `year`, by active time.
    pub top_series: Vec<SeriesReading>,
    /// The longest single session in `year`.
    pub longest_session_ms: i64,
}

/// Only sessions where something happened count; opening a chapter and
/// closing it again leaves a row with nothing in it.
const COUNTED: &str = "(active_ms > 0 OR pages_turned > 0 OR chapters_finished > 0)";

/// The stable key a session is grouped by: the series identity when known.
const SERIES_KEY: &str = "coalesce(series_ident, 'id:' || series_id, 'title:' || series_title)";

impl Library {
    /// Records the page on screen like [`Library::record_progress`], and
    /// adds the event to the reading sessions, in one transaction.
    pub fn record_reading(
        &self,
        chapter_id: i64,
        page: i64,
        clock: ReadingClock,
    ) -> Result<ReadingProgress> {
        let conn = self.conn();
        let tx = conn.unchecked_transaction()?;
        let progress = upsert_progress(&tx, chapter_id, page, clock.now_ms)?;
        record_session(&tx, &progress, clock)?;
        tx.commit()?;
        Ok(progress)
    }

    /// Stats for `year` (a calendar year in the reader's time zone) plus the
    /// all-time totals and streaks, as of `clock`.
    pub fn reading_stats(&self, year: i64, clock: ReadingClock) -> Result<ReadingStats> {
        let conn = self.conn();
        let today = clock.day();
        let (first, last) = (
            days_from_civil(year, 1, 1),
            days_from_civil(year + 1, 1, 1) - 1,
        );

        let all_days = daily(&conn, i64::MIN, i64::MAX)?;
        let day_numbers: Vec<i64> = all_days.iter().map(|(day, _)| *day).collect();
        let year_numbers: Vec<i64> = day_numbers
            .iter()
            .copied()
            .filter(|d| (first..=last).contains(d))
            .collect();

        let mut years: Vec<i64> = day_numbers
            .iter()
            .map(|d| civil_from_days(*d).0)
            .chain([civil_from_days(today).0])
            .collect();
        years.sort_unstable_by(|a, b| b.cmp(a));
        years.dedup();

        let mut months = vec![0; 12];
        let mut days = Vec::new();
        for (day, stat) in all_days.iter().filter(|(d, _)| (first..=last).contains(d)) {
            let (_, month, _) = civil_from_days(*day);
            if let Some(slot) = usize::try_from(month - 1)
                .ok()
                .and_then(|m| months.get_mut(m))
            {
                *slot += stat.active_ms;
            }
            days.push(stat.clone());
        }

        let longest_session_ms: i64 = conn.query_row(
            &format!(
                "SELECT coalesce(max(active_ms), 0) FROM reading_sessions
                 WHERE day BETWEEN ?1 AND ?2 AND {COUNTED}"
            ),
            params![first, last],
            |row| row.get(0),
        )?;

        Ok(ReadingStats {
            year,
            today: iso_date(today),
            years,
            all_time: totals(&conn, i64::MIN, i64::MAX)?,
            year_totals: totals(&conn, first, last)?,
            current_streak: current_streak(&day_numbers, today),
            longest_streak: longest_streak(&day_numbers),
            year_longest_streak: longest_streak(&year_numbers),
            days,
            months,
            top_series: self.top_series(&conn, first, last, TOP_SERIES)?,
            longest_session_ms,
        })
    }

    fn top_series(
        &self,
        conn: &Connection,
        first: i64,
        last: i64,
        limit: usize,
    ) -> Result<Vec<SeriesReading>> {
        // The bare columns come from the latest session of each group
        // (SQLite takes them from the row that holds max()).
        let mut stmt = conn.prepare_cached(&format!(
            "SELECT max(ended_at), series_title, series_ident, series_id,
                    sum(active_ms) AS active, sum(pages_turned) AS pages,
                    sum(chapters_finished), count(*), count(DISTINCT day)
             FROM reading_sessions
             WHERE day BETWEEN ?1 AND ?2 AND {COUNTED}
             GROUP BY {SERIES_KEY}
             ORDER BY active DESC, pages DESC, max(ended_at) DESC
             LIMIT ?3"
        ))?;
        let limit = i64::try_from(limit).unwrap_or(i64::MAX);
        let rows = stmt
            .query_map(params![first, last, limit], |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<i64>>(3)?,
                    SeriesReading {
                        series_id: None,
                        title: String::new(),
                        cover: None,
                        active_ms: row.get(4)?,
                        pages_turned: row.get(5)?,
                        chapters_finished: row.get(6)?,
                        sessions: row.get(7)?,
                        days_read: row.get(8)?,
                    },
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut live = conn.prepare_cached(
            "SELECT s.id, s.title, cv.hash, cv.file, cv.width, cv.height, cv.palette
             FROM series s LEFT JOIN covers cv ON cv.hash = s.cover_hash
             WHERE s.id = ?1 OR (?2 IS NOT NULL AND s.ident = ?2)
             ORDER BY s.id = ?1 DESC, s.missing, s.id
             LIMIT 1",
        )?;
        let mut out = Vec::with_capacity(rows.len());
        for (title, ident, series_id, mut reading) in rows {
            let found = live
                .query_row(params![series_id, ident], |row| {
                    let cover = match row.get::<_, Option<String>>(2)? {
                        Some(hash) => {
                            let file: String = row.get(3)?;
                            let palette: String = row.get(6)?;
                            serde_json::from_str(&palette).ok().map(|palette| CoverRef {
                                hash,
                                path: self.covers.absolute(&file).to_string_lossy().into_owned(),
                                width: row.get(4).unwrap_or_default(),
                                height: row.get(5).unwrap_or_default(),
                                palette,
                            })
                        }
                        None => None,
                    };
                    Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?, cover))
                })
                .optional()?;
            match found {
                Some((id, live_title, cover)) => {
                    reading.series_id = Some(id);
                    reading.title = live_title;
                    reading.cover = cover;
                }
                None => reading.title = title,
            }
            out.push(reading);
        }
        Ok(out)
    }
}

/// The open session the next event may extend.
struct OpenSession {
    id: i64,
    series_id: Option<i64>,
    series_ident: Option<String>,
    day: i64,
    utc_offset_min: i32,
    ended_at: i64,
    last_chapter_id: Option<i64>,
    last_page: i64,
    last_finished_chapter_id: Option<i64>,
}

/// What one event adds to a session.
struct Event {
    series_id: i64,
    series_ident: Option<String>,
    series_title: String,
    chapter_id: i64,
    page: i64,
    at_last_page: bool,
}

fn record_session(
    conn: &Connection,
    progress: &ReadingProgress,
    clock: ReadingClock,
) -> Result<()> {
    let (series_id, series_ident, series_title) = conn.query_row(
        "SELECT s.id, s.ident, s.title FROM chapters c JOIN series s ON s.id = c.series_id
         WHERE c.id = ?1",
        [progress.chapter_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )?;
    let event = Event {
        series_id,
        series_ident,
        series_title,
        chapter_id: progress.chapter_id,
        page: progress.page,
        at_last_page: progress.page_count > 0 && progress.page + 1 >= progress.page_count,
    };

    let open = latest_session(conn)?.filter(|open| {
        let same_series = open.series_id == Some(event.series_id)
            || (event.series_ident.is_some() && open.series_ident == event.series_ident);
        same_series && (clock.now_ms - open.ended_at) <= IDLE_CUTOFF_MS
    });
    let Some(open) = open else {
        // The first event of a session only marks where reading starts.
        return insert_session(conn, &event, clock, &Opening::default());
    };

    // A clock that went backwards counts as no time at all.
    let gap = (clock.now_ms - open.ended_at).max(0);
    let turned = open.last_chapter_id != Some(event.chapter_id) || open.last_page != event.page;
    let finished =
        turned && event.at_last_page && open.last_finished_chapter_id != Some(event.chapter_id);
    let last_finished = if finished {
        Some(event.chapter_id)
    } else {
        open.last_finished_chapter_id
    };

    if clock.day() == open.day {
        conn.execute(
            "UPDATE reading_sessions SET
                 series_id = ?2, series_ident = ?3, series_title = ?4,
                 ended_at = max(ended_at, ?5), active_ms = active_ms + ?6,
                 pages_turned = pages_turned + ?7, chapters_finished = chapters_finished + ?8,
                 last_chapter_id = ?9, last_page = ?10, last_finished_chapter_id = ?11
             WHERE id = ?1",
            params![
                open.id,
                event.series_id,
                event.series_ident,
                event.series_title,
                clock.now_ms,
                gap,
                i64::from(turned),
                i64::from(finished),
                event.chapter_id,
                event.page,
                last_finished,
            ],
        )?;
        return Ok(());
    }

    // Past local midnight (or the offset moved the day): the time up to the
    // end of the session's day stays there, the rest opens the next day.
    let boundary = day_start(open.day + 1, open.utc_offset_min);
    let before = (boundary - open.ended_at).clamp(0, gap);
    conn.execute(
        "UPDATE reading_sessions SET ended_at = ended_at + ?2, active_ms = active_ms + ?2
         WHERE id = ?1",
        params![open.id, before],
    )?;
    let after = gap - before;
    insert_session(
        conn,
        &event,
        clock,
        &Opening {
            active_ms: after,
            turned,
            finished,
            last_finished,
        },
    )
}

/// How a new session starts: empty, or carrying the part of a gap that fell
/// after midnight and the event that ended it.
#[derive(Default)]
struct Opening {
    active_ms: i64,
    turned: bool,
    finished: bool,
    last_finished: Option<i64>,
}

fn insert_session(
    conn: &Connection,
    event: &Event,
    clock: ReadingClock,
    opening: &Opening,
) -> Result<()> {
    conn.execute(
        "INSERT INTO reading_sessions
             (series_id, series_ident, series_title, day, utc_offset_min, started_at, ended_at,
              active_ms, pages_turned, chapters_finished, last_chapter_id, last_page,
              last_finished_chapter_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            event.series_id,
            event.series_ident,
            event.series_title,
            clock.day(),
            clock.utc_offset_min,
            clock.now_ms - opening.active_ms,
            clock.now_ms,
            opening.active_ms,
            i64::from(opening.turned),
            i64::from(opening.finished),
            event.chapter_id,
            event.page,
            opening.last_finished,
        ],
    )?;
    Ok(())
}

fn latest_session(conn: &Connection) -> Result<Option<OpenSession>> {
    Ok(conn
        .query_row(
            "SELECT id, series_id, series_ident, day, utc_offset_min, ended_at,
                    last_chapter_id, last_page, last_finished_chapter_id
             FROM reading_sessions ORDER BY id DESC LIMIT 1",
            [],
            |row| {
                Ok(OpenSession {
                    id: row.get(0)?,
                    series_id: row.get(1)?,
                    series_ident: row.get(2)?,
                    day: row.get(3)?,
                    utc_offset_min: row.get(4)?,
                    ended_at: row.get(5)?,
                    last_chapter_id: row.get(6)?,
                    last_page: row.get(7)?,
                    last_finished_chapter_id: row.get(8)?,
                })
            },
        )
        .optional()?)
}

/// Per-day sums for the days in `first..=last` that have reading.
fn daily(conn: &Connection, first: i64, last: i64) -> Result<Vec<(i64, ReadingDay)>> {
    let mut stmt = conn.prepare_cached(&format!(
        "SELECT day, sum(active_ms), sum(pages_turned), sum(chapters_finished), count(*)
         FROM reading_sessions
         WHERE day BETWEEN ?1 AND ?2 AND {COUNTED}
         GROUP BY day ORDER BY day"
    ))?;
    let rows = stmt.query_map(params![first, last], |row| {
        let day: i64 = row.get(0)?;
        Ok((
            day,
            ReadingDay {
                date: iso_date(day),
                active_ms: row.get(1)?,
                pages_turned: row.get(2)?,
                chapters_finished: row.get(3)?,
                sessions: row.get(4)?,
            },
        ))
    })?;
    Ok(rows.collect::<rusqlite::Result<_>>()?)
}

fn totals(conn: &Connection, first: i64, last: i64) -> Result<ReadingTotals> {
    Ok(conn.query_row(
        &format!(
            "SELECT coalesce(sum(active_ms), 0), count(*), coalesce(sum(pages_turned), 0),
                    coalesce(sum(chapters_finished), 0), count(DISTINCT day),
                    count(DISTINCT {SERIES_KEY})
             FROM reading_sessions
             WHERE day BETWEEN ?1 AND ?2 AND {COUNTED}"
        ),
        params![first, last],
        |row| {
            Ok(ReadingTotals {
                active_ms: row.get(0)?,
                sessions: row.get(1)?,
                pages_turned: row.get(2)?,
                chapters_finished: row.get(3)?,
                days_read: row.get(4)?,
                series_read: row.get(5)?,
            })
        },
    )?)
}

fn streak(start: i64, end: i64) -> Streak {
    Streak {
        days: end - start + 1,
        start: Some(iso_date(start)),
        end: Some(iso_date(end)),
    }
}

/// Runs of consecutive days in sorted, distinct `days`, as `(start, end)`.
fn runs(days: &[i64]) -> Vec<(i64, i64)> {
    let mut out: Vec<(i64, i64)> = Vec::new();
    for &day in days {
        match out.last_mut() {
            Some((_, end)) if day == *end + 1 => *end = day,
            Some((_, end)) if day <= *end => {}
            _ => out.push((day, day)),
        }
    }
    out
}

/// The run that ends today, or yesterday when today has no reading yet (a
/// streak is not broken until a whole day passes without reading).
pub(crate) fn current_streak(days: &[i64], today: i64) -> Streak {
    runs(days)
        .last()
        .filter(|(_, end)| *end == today || *end == today - 1)
        .map_or_else(Streak::default, |(start, end)| streak(*start, *end))
}

/// The longest run; the most recent one wins a tie.
pub(crate) fn longest_streak(days: &[i64]) -> Streak {
    runs(days)
        .into_iter()
        .fold(None::<(i64, i64)>, |best, (start, end)| match best {
            Some((s, e)) if e - s > end - start => Some((s, e)),
            _ => Some((start, end)),
        })
        .map_or_else(Streak::default, |(start, end)| streak(start, end))
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;
    /// 2026-03-08 00:00 UTC, a Sunday.
    const DAY0: i64 = 20_520;
    const T0: i64 = DAY0 * DAY_MS;

    struct Fixture {
        _dir: tempfile::TempDir,
        library: Library,
        /// Chapter ids: two of Moonlit (10 pages each), one of Ember (3 pages).
        moonlit: [i64; 2],
        ember: i64,
    }

    fn fixture() -> Fixture {
        let dir = tempfile::tempdir().unwrap();
        let library = Library::open_in_memory(dir.path()).unwrap();
        let (moonlit, ember) = {
            let conn = library.conn();
            conn.execute_batch(
                "INSERT INTO library_roots (id, path, added_at) VALUES (1, '/m', 0);
                 INSERT INTO series (id, root_id, key, path, title, sort_title, added_at,
                                     updated_at, ident)
                     VALUES (1, 1, 'dir:/m/Moonlit', '/m/Moonlit', 'Moonlit', 'moonlit', 0, 0,
                             'dir:Moonlit'),
                            (2, 1, 'dir:/m/Ember', '/m/Ember', 'Ember', 'ember', 0, 0,
                             'dir:Ember');
                 INSERT INTO chapters (id, series_id, path, kind, page_count, file_size,
                                       file_mtime, added_at, updated_at)
                     VALUES (11, 1, '/m/Moonlit/1.cbz', 'zip', 10, 1, 0, 0, 0),
                            (12, 1, '/m/Moonlit/2.cbz', 'zip', 10, 1, 0, 0, 0),
                            (21, 2, '/m/Ember/1.cbz', 'zip', 3, 1, 0, 0, 0);",
            )
            .unwrap();
            ([11, 12], 21)
        };
        Fixture {
            _dir: dir,
            library,
            moonlit,
            ember,
        }
    }

    impl Fixture {
        fn read(&self, chapter: i64, page: i64, at: i64, offset: i32) {
            self.library
                .record_reading(chapter, page, ReadingClock::at(at, offset))
                .unwrap();
        }

        /// A page a minute from the first page for `minutes`, staying on the
        /// last one once there.
        fn read_for(&self, chapter: i64, start: i64, minutes: i64) {
            for k in 0..=minutes {
                self.read(chapter, k.min(9), start + k * MIN, 0);
            }
        }

        /// `(day, active_ms, pages_turned, chapters_finished)` per session.
        fn sessions(&self) -> Vec<(i64, i64, i64, i64)> {
            let conn = self.library.conn();
            let mut stmt = conn
                .prepare(
                    "SELECT day, active_ms, pages_turned, chapters_finished
                     FROM reading_sessions ORDER BY started_at, id",
                )
                .unwrap();
            stmt.query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
            })
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap()
        }

        fn stats(&self, year: i64, at: i64, offset: i32) -> ReadingStats {
            self.library
                .reading_stats(year, ReadingClock::at(at, offset))
                .unwrap()
        }
    }

    #[test]
    fn local_days_follow_the_offset() {
        // 23:30 UTC is still the same day in London and already the next in Tokyo.
        let at = T0 + 23 * 60 * MIN + 30 * MIN;
        assert_eq!(local_day(at, 0), DAY0);
        assert_eq!(local_day(at, 9 * 60), DAY0 + 1);
        assert_eq!(local_day(at, -5 * 60), DAY0);
        // Before the epoch rounds down, not toward zero.
        assert_eq!(local_day(-1, 0), -1);
        assert_eq!(
            ReadingClock::at(0, 99_999).utc_offset_min,
            MAX_UTC_OFFSET_MIN
        );
    }

    #[test]
    fn events_within_the_cutoff_extend_one_session() {
        let fx = fixture();
        let [ch1, _] = fx.moonlit;
        fx.read(ch1, 0, T0, 0);
        fx.read(ch1, 1, T0 + 2 * MIN, 0);
        fx.read(ch1, 2, T0 + 3 * MIN, 0);
        // The close-time write repeats the page: time, but no turn.
        fx.read(ch1, 2, T0 + 4 * MIN, 0);
        assert_eq!(fx.sessions(), vec![(DAY0, 4 * MIN, 2, 0)]);
    }

    #[test]
    fn a_pause_longer_than_the_cutoff_starts_a_new_session_and_counts_nothing() {
        let fx = fixture();
        let [ch1, _] = fx.moonlit;
        fx.read(ch1, 0, T0, 0);
        fx.read(ch1, 1, T0 + IDLE_CUTOFF_MS, 0); // exactly the cutoff still counts
        fx.read(ch1, 2, T0 + 2 * IDLE_CUTOFF_MS + 1, 0); // one ms over does not
        fx.read(ch1, 3, T0 + 2 * IDLE_CUTOFF_MS + 1 + MIN, 0);
        assert_eq!(
            fx.sessions(),
            vec![(DAY0, IDLE_CUTOFF_MS, 1, 0), (DAY0, MIN, 1, 0)]
        );
    }

    #[test]
    fn another_series_starts_a_new_session() {
        let fx = fixture();
        fx.read(fx.moonlit[0], 0, T0, 0);
        fx.read(fx.moonlit[0], 1, T0 + MIN, 0);
        fx.read(fx.ember, 0, T0 + 2 * MIN, 0);
        fx.read(fx.ember, 1, T0 + 3 * MIN, 0);
        assert_eq!(fx.sessions(), vec![(DAY0, MIN, 1, 0), (DAY0, MIN, 1, 0)]);
    }

    #[test]
    fn a_clock_that_goes_back_adds_no_time() {
        let fx = fixture();
        fx.read(fx.ember, 0, T0 + 10 * MIN, 0);
        fx.read(fx.ember, 1, T0 + 9 * MIN, 0);
        assert_eq!(fx.sessions(), vec![(DAY0, 0, 1, 0)]);
    }

    #[test]
    fn reading_across_local_midnight_splits_the_session_at_midnight() {
        let fx = fixture();
        let [ch1, _] = fx.moonlit;
        // UTC+2: 23:58 local is 21:58 UTC on DAY0.
        let offset = 120;
        let midnight = day_start(DAY0 + 1, offset);
        fx.read(ch1, 0, midnight - 2 * MIN, offset);
        fx.read(ch1, 1, midnight - MIN, offset);
        fx.read(ch1, 2, midnight + 3 * MIN, offset);
        fx.read(ch1, 3, midnight + 4 * MIN, offset);
        assert_eq!(
            fx.sessions(),
            vec![(DAY0, 2 * MIN, 1, 0), (DAY0 + 1, 4 * MIN, 2, 0)]
        );
        let stats = fx.stats(2026, midnight + 5 * MIN, offset);
        assert_eq!(stats.current_streak.days, 2);
        assert_eq!(stats.current_streak.start.as_deref(), Some("2026-03-08"));
        assert_eq!(stats.today, "2026-03-09");
    }

    #[test]
    fn the_same_instants_land_on_different_days_in_different_zones() {
        // 23:00 to 23:04 UTC: one day in UTC, the next in Tokyo.
        let at = T0 + 23 * 60 * MIN;
        let utc = fixture();
        utc.read(utc.ember, 0, at, 0);
        utc.read(utc.ember, 1, at + 4 * MIN, 0);
        assert_eq!(utc.sessions(), vec![(DAY0, 4 * MIN, 1, 0)]);

        let tokyo = fixture();
        tokyo.read(tokyo.ember, 0, at, 9 * 60);
        tokyo.read(tokyo.ember, 1, at + 4 * MIN, 9 * 60);
        assert_eq!(tokyo.sessions(), vec![(DAY0 + 1, 4 * MIN, 1, 0)]);
    }

    #[test]
    fn a_new_offset_mid_session_moves_only_the_new_part() {
        let fx = fixture();
        // 23:55 UTC in London, then the reader lands in UTC+1 where it is 01:00.
        let at = T0 + 23 * 60 * MIN + 55 * MIN;
        fx.read(fx.ember, 0, at, 0);
        fx.read(fx.ember, 1, at + 2 * MIN, 60);
        assert_eq!(
            fx.sessions(),
            vec![(DAY0, 2 * MIN, 0, 0), (DAY0 + 1, 0, 1, 0)]
        );
    }

    #[test]
    fn finishing_a_chapter_counts_once_per_session() {
        let fx = fixture();
        let ember = fx.ember; // 3 pages
        fx.read(ember, 0, T0, 0);
        fx.read(ember, 1, T0 + MIN, 0);
        fx.read(ember, 2, T0 + 2 * MIN, 0); // last page: finished
        fx.read(ember, 1, T0 + 3 * MIN, 0); // back a page
        fx.read(ember, 2, T0 + 4 * MIN, 0); // and forward again: not twice
        assert_eq!(fx.sessions(), vec![(DAY0, 4 * MIN, 4, 1)]);

        // Opening the finished chapter later (on its last page) is not a finish.
        fx.read(ember, 2, T0 + 60 * MIN, 0);
        fx.read(ember, 2, T0 + 61 * MIN, 0);
        assert_eq!(fx.sessions()[1], (DAY0, MIN, 0, 0));
    }

    #[test]
    fn moving_to_the_next_chapter_is_a_turn() {
        let fx = fixture();
        let [ch1, ch2] = fx.moonlit;
        fx.read(ch1, 9, T0, 0);
        fx.read(ch2, 0, T0 + MIN, 0);
        fx.read(ch2, 9, T0 + 2 * MIN, 0);
        assert_eq!(fx.sessions(), vec![(DAY0, 2 * MIN, 2, 1)]);
    }

    #[test]
    fn progress_is_saved_with_the_session() {
        let fx = fixture();
        let progress = fx
            .library
            .record_reading(fx.ember, 99, ReadingClock::at(T0, 0))
            .unwrap();
        assert_eq!(progress.page, 2);
        assert!(progress.completed);
        assert!(
            fx.library
                .record_reading(999, 0, ReadingClock::at(T0, 0))
                .is_err()
        );
        assert_eq!(fx.sessions().len(), 1);
    }

    #[test]
    fn streaks_end_today_or_yesterday() {
        let d = DAY0;
        assert_eq!(current_streak(&[], d), Streak::default());
        assert_eq!(current_streak(&[d - 2, d - 1, d], d).days, 3);
        // Today has no reading yet: the streak is still alive.
        assert_eq!(current_streak(&[d - 2, d - 1], d).days, 2);
        // A whole day without reading breaks it.
        assert_eq!(current_streak(&[d - 3, d - 2], d).days, 0);
        assert_eq!(current_streak(&[d - 5, d - 1, d], d).days, 2);
    }

    #[test]
    fn the_longest_streak_prefers_the_latest_on_a_tie() {
        let d = DAY0;
        assert_eq!(longest_streak(&[]), Streak::default());
        let streak = longest_streak(&[d, d + 1, d + 5, d + 6, d + 10]);
        assert_eq!(streak.days, 2);
        assert_eq!(streak.start.as_deref(), Some("2026-03-13"));
        assert_eq!(longest_streak(&[d, d + 1, d + 2, d + 7]).days, 3);
    }

    #[test]
    fn stats_sum_the_year_and_rank_the_series() {
        let fx = fixture();
        let [ch1, ch2] = fx.moonlit;
        // Moonlit on three days in a row, Ember once; one Moonlit day in 2025.
        for (day, minutes) in [(0, 10), (1, 20), (2, 5)] {
            let start = T0 + day * DAY_MS + 20 * 60 * MIN;
            fx.read_for(ch1, start, minutes);
        }
        let ember_start = T0 + 22 * 60 * MIN;
        fx.read(fx.ember, 0, ember_start, 0);
        fx.read(fx.ember, 2, ember_start + 3 * MIN, 0);
        let last_year = days_from_civil(2025, 12, 30) * DAY_MS;
        fx.read(ch2, 0, last_year, 0);
        fx.read(ch2, 1, last_year + MIN, 0);
        // An empty session (opened and closed) counts for nothing.
        fx.read(fx.ember, 0, T0 + 30 * DAY_MS, 0);

        let stats = fx.stats(2026, T0 + 2 * DAY_MS + 23 * 60 * MIN, 0);
        assert_eq!(stats.years, vec![2026, 2025]);
        assert_eq!(stats.year_totals.active_ms, 38 * MIN);
        assert_eq!(stats.year_totals.sessions, 4);
        assert_eq!(stats.year_totals.days_read, 3);
        assert_eq!(stats.year_totals.series_read, 2);
        // Day 2 stops at page 5 of 10, so two Moonlit finishes and one Ember.
        assert_eq!(stats.year_totals.chapters_finished, 3);
        assert_eq!(stats.all_time.active_ms, 39 * MIN);
        assert_eq!(stats.all_time.days_read, 4);
        assert_eq!(stats.months[2], 38 * MIN);
        assert_eq!(stats.months.iter().sum::<i64>(), 38 * MIN);
        assert_eq!(stats.days.len(), 3);
        assert_eq!(stats.days[0].date, "2026-03-08");
        assert_eq!(stats.days[0].active_ms, 13 * MIN);
        assert_eq!(stats.longest_session_ms, 20 * MIN);
        assert_eq!(stats.current_streak.days, 3);
        assert_eq!(stats.year_longest_streak.days, 3);
        // 2025-12-30 is not next to 2026-03-08, so all time is still 3.
        assert_eq!(stats.longest_streak.days, 3);

        let titles: Vec<_> = stats.top_series.iter().map(|s| s.title.as_str()).collect();
        assert_eq!(titles, ["Moonlit", "Ember"]);
        assert_eq!(stats.top_series[0].series_id, Some(1));
        assert_eq!(stats.top_series[0].active_ms, 35 * MIN);
        assert_eq!(stats.top_series[0].days_read, 3);

        let last = fx.stats(2025, T0, 0);
        assert_eq!(last.year_totals.active_ms, MIN);
        assert_eq!(last.top_series.len(), 1);
    }

    #[test]
    fn stats_outlive_a_removed_series() {
        let fx = fixture();
        fx.read(fx.ember, 0, T0, 0);
        fx.read(fx.ember, 1, T0 + MIN, 0);
        assert!(fx.library.remove_root(1).unwrap());
        let stats = fx.stats(2026, T0, 0);
        assert_eq!(stats.year_totals.active_ms, MIN);
        let top = &stats.top_series[0];
        assert_eq!((top.series_id, top.title.as_str()), (None, "Ember"));
    }

    #[test]
    fn an_empty_library_has_empty_stats() {
        let fx = fixture();
        let stats = fx.stats(2026, T0, 0);
        assert_eq!(stats.years, vec![2026]);
        assert_eq!(stats.all_time, ReadingTotals::default());
        assert!(stats.days.is_empty() && stats.top_series.is_empty());
        assert_eq!(stats.months, vec![0; 12]);
        assert_eq!(stats.current_streak, Streak::default());
    }
}
