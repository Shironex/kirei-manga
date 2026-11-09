-- 0007: collections, tags, Want to Read and saved smart filters.
--
-- It only reads `series`, which every schema since 0001 has.
-- `IF NOT EXISTS` keeps a re-run harmless.
--
-- series_refs: one row per series the user organised (tagged, put in a
-- collection or in Want to Read). A series of the local library and a
-- MangaDex title are named the same way, so both can join the same lists:
--
--   series_id      the live local row, NULL for a title that is not on disk
--                  or when its root was removed (then it is an orphan)
--   series_ident   the stable identity of the local series (see 0002), so a
--                  removed and re-added folder finds its tags again
--   source         'mangadex' with remote_id the manga UUID, or NULL
--   title, cover_file  what the source last said (cover_file is the
--                  MangaDex cover file name), to show a remote title
--                  offline; a local series always shows its own row
--   want_at        set while the series is in Want to Read, and when it was
--                  added there
--
-- A row names at least one of the three. Nothing else points at a series
-- directly: tags and collections hang off the ref.

CREATE TABLE IF NOT EXISTS series_refs (
    id           INTEGER PRIMARY KEY,
    series_id    INTEGER UNIQUE REFERENCES series (id) ON DELETE SET NULL,
    series_ident TEXT,
    source       TEXT    CHECK (source IN ('mangadex')),
    remote_id    TEXT,
    title        TEXT,
    cover_file    TEXT,
    want_at      INTEGER,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    CHECK ((source IS NULL) = (remote_id IS NULL)),
    CHECK (series_id IS NOT NULL OR series_ident IS NOT NULL OR remote_id IS NOT NULL),
    UNIQUE (source, remote_id)
);
CREATE INDEX IF NOT EXISTS series_refs_orphans ON series_refs (series_ident)
    WHERE series_id IS NULL;
CREATE INDEX IF NOT EXISTS series_refs_want ON series_refs (want_at)
    WHERE want_at IS NOT NULL;

-- Free tags. Names are unique ignoring case; a tag no series carries any
-- more is deleted with its last use.
CREATE TABLE IF NOT EXISTS tags (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS series_tags (
    tag_id   INTEGER NOT NULL REFERENCES tags (id) ON DELETE CASCADE,
    ref_id   INTEGER NOT NULL REFERENCES series_refs (id) ON DELETE CASCADE,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (tag_id, ref_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS series_tags_ref ON series_tags (ref_id);

-- User collections, in the order the user put them. `cover_ref` is the
-- member whose cover stands for the collection; NULL means the first one.
CREATE TABLE IF NOT EXISTS collections (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
    position   INTEGER NOT NULL,
    cover_ref  INTEGER REFERENCES series_refs (id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
    collection_id INTEGER NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    ref_id        INTEGER NOT NULL REFERENCES series_refs (id) ON DELETE CASCADE,
    position      INTEGER NOT NULL,
    added_at      INTEGER NOT NULL,
    PRIMARY KEY (collection_id, ref_id)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS collection_items_order ON collection_items (collection_id, position);
CREATE INDEX IF NOT EXISTS collection_items_ref ON collection_items (ref_id);

-- Saved smart filters. `query` is the JSON of `kirei_library::FilterQuery`;
-- the library parses it and builds the SQL, so it is never run as text.
-- Pinned filters show as rows on Home, in `position` order.
CREATE TABLE IF NOT EXISTS smart_filters (
    id         INTEGER PRIMARY KEY,
    name       TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    query      TEXT    NOT NULL CHECK (json_valid(query)),
    pinned     INTEGER NOT NULL DEFAULT 0,
    position   INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- The filters read these columns of the catalogue.
CREATE INDEX IF NOT EXISTS series_added ON series (added_at);
CREATE INDEX IF NOT EXISTS series_language ON series (language) WHERE language IS NOT NULL;
-- Chapters on disk per series, counted from the index alone.
CREATE INDEX IF NOT EXISTS chapters_presence ON chapters (series_id, missing);
CREATE INDEX IF NOT EXISTS chapters_language ON chapters (language) WHERE language IS NOT NULL;
