-- 0005: AniList tracking.
--
-- Two tables, self-contained: they reference no other table, so this file
-- applies the same whatever later migrations add. `IF NOT EXISTS` keeps a
-- re-run harmless.
--
-- tracker_links: one row per series linked to an AniList entry. The series
-- is named by a stable key, not a row id, so a link survives a removed and
-- re-added folder the same way reading progress does:
--
--   'local:<series ident>'     a series of the local library
--   'mangadex:<manga uuid>'    a MangaDex series
--
-- The remote_* columns cache what AniList last said, so the series page can
-- show remote progress without a request. synced_progress is the progress
-- both sides last agreed on; the conflict rules use it to tell a reread here
-- from progress made on another device.
--
-- tracker_queue: updates waiting to reach AniList, at most one per entry.
-- A newer update for the same entry replaces the waiting one and bumps
-- `revision`, so a delivery that started before it never deletes it.
-- `state` is 'pending' (sent when next_attempt_at passes), 'blocked' (waits
-- for a new sign in) or 'failed' (AniList refused it; kept for the user to
-- see and retry).

CREATE TABLE IF NOT EXISTS tracker_links (
    id                INTEGER PRIMARY KEY,
    tracker           TEXT    NOT NULL CHECK (tracker IN ('anilist')),
    series_key        TEXT    NOT NULL,
    media_id          INTEGER NOT NULL,
    source            TEXT    NOT NULL CHECK (source IN ('manual', 'mangadex')),
    title             TEXT,
    total_chapters    INTEGER,
    remote_progress   INTEGER,
    remote_status     TEXT,
    remote_score      REAL,
    remote_checked_at INTEGER,
    synced_progress   INTEGER,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL,
    UNIQUE (tracker, series_key)
);
CREATE INDEX IF NOT EXISTS tracker_links_media ON tracker_links (tracker, media_id);

CREATE TABLE IF NOT EXISTS tracker_queue (
    id              INTEGER PRIMARY KEY,
    tracker         TEXT    NOT NULL CHECK (tracker IN ('anilist')),
    media_id        INTEGER NOT NULL,
    progress        INTEGER,
    status          TEXT,
    score           INTEGER,
    state           TEXT    NOT NULL DEFAULT 'pending'
                            CHECK (state IN ('pending', 'blocked', 'failed')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    revision        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    UNIQUE (tracker, media_id)
);
CREATE INDEX IF NOT EXISTS tracker_queue_due ON tracker_queue (state, next_attempt_at);
