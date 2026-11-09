-- 0006: online state for MangaDex (follows, the updates feed, read markers
-- and the per series language switch).
--
-- MangaDex ids are UUID strings. Series and chapters are cached as the JSON
-- the app gets from the MangaDex client, so the follow list and the feed
-- show offline; the library crate stores the blobs and never reads inside
-- them. Nothing here points at the local catalogue.

-- A MangaDex series the app knows something about: followed, given a
-- reading status, or given a language switch. `data` is the cached series,
-- NULL while only the switch is set.
CREATE TABLE online_series (
    manga_id        TEXT    PRIMARY KEY,
    data            TEXT,
    followed        INTEGER NOT NULL DEFAULT 0,
    reading_status  TEXT,
    -- Show only this language on the series page; NULL fills each chapter
    -- from the language chain.
    single_language TEXT,
    updated_at      INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX online_series_followed ON online_series (followed) WHERE followed = 1;

-- New chapters of followed series. `published_at` is MangaDex's readableAt
-- in Unix milliseconds; `notified` is set once a system notification named
-- the chapter, so a restart never announces it twice.
CREATE TABLE online_feed (
    chapter_id   TEXT    PRIMARY KEY,
    manga_id     TEXT    NOT NULL,
    data         TEXT    NOT NULL,
    published_at INTEGER NOT NULL,
    first_seen   INTEGER NOT NULL,
    notified     INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;

CREATE INDEX online_feed_published ON online_feed (published_at DESC);

-- Read markers of MangaDex chapters, synced both ways. `pending` marks a
-- local change MangaDex has not taken yet; it wins over what MangaDex says
-- until it is sent. `page` is where reading stopped, for resuming.
CREATE TABLE online_read (
    chapter_id TEXT    PRIMARY KEY,
    manga_id   TEXT    NOT NULL,
    read       INTEGER NOT NULL DEFAULT 0,
    pending    INTEGER NOT NULL DEFAULT 0,
    page       INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX online_read_manga ON online_read (manga_id);
CREATE INDEX online_read_pending ON online_read (pending) WHERE pending = 1;

-- Small facts about the online account: the signed-in username, when the
-- feed was last refreshed.
CREATE TABLE online_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) WITHOUT ROWID;
