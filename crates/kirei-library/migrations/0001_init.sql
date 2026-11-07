-- 0001: the first library schema.
--
-- Timestamps are INTEGER Unix milliseconds (UTC). File mtimes use the same
-- unit. Paths are absolute, as the OS reports them.

CREATE TABLE library_roots (
    id           INTEGER PRIMARY KEY,
    path         TEXT    NOT NULL UNIQUE,
    added_at     INTEGER NOT NULL,
    last_scan_at INTEGER
);

-- One row per distinct cover image, keyed by the BLAKE3 hash of the source
-- image bytes. The thumbnail file lives in the cover cache directory.
CREATE TABLE covers (
    hash       TEXT    PRIMARY KEY,
    file       TEXT    NOT NULL,          -- relative to the cover cache dir
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL,
    palette    TEXT    NOT NULL CHECK (json_valid(palette)),
    created_at INTEGER NOT NULL
);

CREATE TABLE series (
    id              INTEGER PRIMARY KEY,
    root_id         INTEGER NOT NULL REFERENCES library_roots (id) ON DELETE CASCADE,
    -- Stable identity across scans: 'dir:<folder path>' for a series folder,
    -- 'loose:<root path>:<normalised title>' for archives loose in a root.
    key             TEXT    NOT NULL UNIQUE,
    path            TEXT    NOT NULL,
    title           TEXT    NOT NULL,
    sort_title      TEXT    NOT NULL,
    title_from_info INTEGER NOT NULL DEFAULT 0,
    description     TEXT,
    writer          TEXT,
    year            INTEGER,
    language        TEXT,
    genres          TEXT,
    manga           TEXT,                 -- ComicInfo <Manga>, e.g. YesAndRightToLeft
    cover_hash      TEXT    REFERENCES covers (hash) ON DELETE SET NULL,
    cover_source    TEXT,                 -- chapter path, mtime and page the cover came from
    missing         INTEGER NOT NULL DEFAULT 0,
    added_at        INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL
);
CREATE INDEX series_root ON series (root_id);
CREATE INDEX series_sort ON series (sort_title);

-- One row per archive or image folder.
CREATE TABLE chapters (
    id         INTEGER PRIMARY KEY,
    series_id  INTEGER NOT NULL REFERENCES series (id) ON DELETE CASCADE,
    path       TEXT    NOT NULL UNIQUE,
    kind       TEXT    NOT NULL CHECK (kind IN ('zip', 'rar', 'folder')),
    title      TEXT,
    volume     REAL,
    number     REAL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    page_count INTEGER NOT NULL DEFAULT 0,
    cover_page INTEGER NOT NULL DEFAULT 0,
    file_size  INTEGER NOT NULL,
    file_mtime INTEGER NOT NULL,
    language   TEXT,
    scan_group TEXT,
    missing    INTEGER NOT NULL DEFAULT 0,
    error      TEXT,                      -- why the last open failed, if it did
    added_at   INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX chapters_series ON chapters (series_id, sort_order);

CREATE TABLE reading_progress (
    chapter_id INTEGER PRIMARY KEY REFERENCES chapters (id) ON DELETE CASCADE,
    page       INTEGER NOT NULL,          -- 0 based
    page_count INTEGER NOT NULL,
    completed  INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
CREATE INDEX reading_progress_recent ON reading_progress (updated_at DESC);

-- Free-form per-series settings (reader mode, filters, adjustments), owned
-- by the UI. The library only checks that it is JSON.
CREATE TABLE series_settings (
    series_id  INTEGER PRIMARY KEY REFERENCES series (id) ON DELETE CASCADE,
    settings   TEXT    NOT NULL CHECK (json_valid(settings)),
    updated_at INTEGER NOT NULL
);
