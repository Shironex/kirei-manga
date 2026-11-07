-- 0002: reading progress and series settings outlive the rows they describe.
--
-- Removing a library root used to cascade into progress and settings. Now
-- both tables carry a stable identity (`ident`) that does not depend on the
-- root, so a re-added or moved folder finds its progress again:
--
--   series.ident   'dir:<folder name>' or 'loose:<title key>'
--   chapters.ident '<series ident>|<path relative to the series folder>'
--
-- The link to the live row becomes ON DELETE SET NULL. A row with a NULL link
-- is an orphan: the UI never lists it, a scan re-links it when a chapter or
-- series with the same ident (and, for progress, the same file size) shows
-- up, and Library::purge_orphans deletes the old ones.
--
-- `ident` columns are backfilled for existing rows by the library at open
-- time (the path logic lives in Rust, not SQL), so they are nullable here.

ALTER TABLE series ADD COLUMN ident TEXT;
ALTER TABLE chapters ADD COLUMN ident TEXT;
CREATE INDEX chapters_ident ON chapters (ident);

CREATE TABLE reading_progress_new (
    id          INTEGER PRIMARY KEY,
    chapter_id  INTEGER UNIQUE REFERENCES chapters (id) ON DELETE SET NULL,
    ident       TEXT,
    file_size   INTEGER NOT NULL,         -- fingerprint of the file the page refers to
    page        INTEGER NOT NULL,         -- 0 based
    page_count  INTEGER NOT NULL,
    completed   INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL,
    orphaned_at INTEGER                   -- when the chapter row went away
);
INSERT INTO reading_progress_new (chapter_id, file_size, page, page_count, completed, updated_at)
    SELECT p.chapter_id, c.file_size, p.page, p.page_count, p.completed, p.updated_at
    FROM reading_progress p JOIN chapters c ON c.id = p.chapter_id;
DROP TABLE reading_progress;
ALTER TABLE reading_progress_new RENAME TO reading_progress;
CREATE INDEX reading_progress_recent ON reading_progress (updated_at DESC);
CREATE INDEX reading_progress_orphans ON reading_progress (ident) WHERE chapter_id IS NULL;

CREATE TABLE series_settings_new (
    id          INTEGER PRIMARY KEY,
    series_id   INTEGER UNIQUE REFERENCES series (id) ON DELETE SET NULL,
    ident       TEXT,
    settings    TEXT    NOT NULL CHECK (json_valid(settings)),
    updated_at  INTEGER NOT NULL,
    orphaned_at INTEGER
);
INSERT INTO series_settings_new (series_id, settings, updated_at)
    SELECT series_id, settings, updated_at FROM series_settings;
DROP TABLE series_settings;
ALTER TABLE series_settings_new RENAME TO series_settings;
CREATE INDEX series_settings_orphans ON series_settings (ident) WHERE series_id IS NULL;
