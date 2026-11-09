-- 0004: reading sessions, the source of the reading stats.
--
-- One row per stretch of reading one series without a long pause. The
-- library writes them from progress events (Library::record_reading): an
-- event within the idle cutoff of the open session extends it, anything
-- later, another series, or local midnight starts a new one. So a session
-- never spans two local days, and `day` is exact.
--
--   day             local calendar day of the session, as days since
--                   1970-01-01, fixed with the UTC offset the reader had
--   utc_offset_min  that offset, minutes east of UTC
--   active_ms       time between events, each gap capped by the idle cutoff
--   pages_turned    progress events that moved to another page or chapter
--
-- Sessions describe a series by its stable identity (`series_ident`) and keep
-- the title as it was, so stats outlive a removed root or a rescan. The link
-- to the live row is ON DELETE SET NULL like reading_progress. The last_*
-- columns only matter while the session is open.
--
-- Nothing here leaves the machine; the table travels only inside a backup.

CREATE TABLE reading_sessions (
    id                       INTEGER PRIMARY KEY,
    series_id                INTEGER REFERENCES series (id) ON DELETE SET NULL,
    series_ident             TEXT,
    series_title             TEXT    NOT NULL,
    day                      INTEGER NOT NULL,
    utc_offset_min           INTEGER NOT NULL,
    started_at               INTEGER NOT NULL,
    ended_at                 INTEGER NOT NULL,
    active_ms                INTEGER NOT NULL DEFAULT 0 CHECK (active_ms >= 0),
    pages_turned             INTEGER NOT NULL DEFAULT 0 CHECK (pages_turned >= 0),
    chapters_finished        INTEGER NOT NULL DEFAULT 0 CHECK (chapters_finished >= 0),
    last_chapter_id          INTEGER REFERENCES chapters (id) ON DELETE SET NULL,
    last_page                INTEGER NOT NULL DEFAULT 0,
    last_finished_chapter_id INTEGER REFERENCES chapters (id) ON DELETE SET NULL
);
CREATE INDEX reading_sessions_day ON reading_sessions (day);
CREATE INDEX reading_sessions_recent ON reading_sessions (ended_at DESC);
CREATE INDEX reading_sessions_series ON reading_sessions (series_ident);
