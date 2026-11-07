# Library

The local library lives in `crates/kirei-library`: a SQLite catalogue, the folder scanner that fills it, reading progress, per-series settings, and a cover cache with the palette each cover seeds the theme with. The desktop shell wraps it in thin commands (`apps/desktop/src-tauri/src/catalog.rs`) and the renderer calls them through `apps/desktop/src/lib/library.ts`.

User files are only ever read. Removing a root, or an archive vanishing, changes rows in the database and never anything on disk. Removing a root keeps reading progress and series settings (see Keeping progress).

## Storage

| What           | Where                                                             |
| -------------- | ----------------------------------------------------------------- |
| Database       | `<data folder>/library.sqlite3` (WAL, foreign keys on)            |
| Cover cache    | `<data folder>/covers/<hh>/<hash>.jpg`                            |
| SQLite library | rusqlite with the `bundled` amalgamation, same build on every OS  |

The data folder is the OS app data directory, or `data/` beside the app in portable mode; see `docs/data.md`, which also covers backups.

rusqlite over sqlx: the library is synchronous by design (scans run on the rayon pool, commands on Tauri's blocking pool), so an async driver would add a runtime and compile time for nothing. `bundled` avoids depending on whatever SQLite the OS ships.

Timestamps and file mtimes are `INTEGER` Unix milliseconds (UTC), so there is one format and no time zone parsing.

## Migrations

SQL files in `crates/kirei-library/migrations/`, embedded at compile time and listed in `db.rs`. `PRAGMA user_version` records the last one applied. Each migration runs in one transaction with its version bump, so a failure leaves the previous version intact. A database from a newer build is refused rather than guessed at. Migrations are append only: never edit a shipped file, add the next number. `tests/migrations.rs` builds a v1 fixture database and opens it with the current build to prove the forward path, including that progress and settings come through with their identities.

## Schema (v3)

| Table              | One row per                              | Notes                                                                                                                                                              |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `library_roots`    | folder the user added                    | Canonical path, unique. Roots may not nest.                                                                                                                        |
| `series`           | series                                   | `key` is the stable identity (`dir:<folder>` or `loose:<root>:<title key>`). Title, ComicInfo metadata, `cover_hash`, `missing`.                                   |
| `chapters`         | archive or image folder                  | `path` unique, `kind` (`zip`, `rar`, `folder`), volume and number (`REAL`, so 10.5 works), `sort_order`, `page_count`, `file_size` + `file_mtime`, `missing`, `error`. |
| `reading_progress` | chapter that has been opened             | `chapter_id` (nullable, `ON DELETE SET NULL`), `ident`, `file_size`, 0 based `page`, `page_count`, `completed` (sticky), `updated_at`, `orphaned_at`.              |
| `series_settings`  | series with saved reader settings        | `series_id` (nullable, `ON DELETE SET NULL`), `ident`, `orphaned_at`; `settings` is a JSON blob owned by the UI (reader mode, filters, adjustments).               |
| `app_settings`     | app setting the user changed             | Dotted `key`, JSON `value`. Contract and defaults in `kirei_core::AppSettings`; see `docs/settings.md`.                                                         |
| `covers`           | distinct cover image                     | Keyed by the BLAKE3 hash of the source image bytes. Thumbnail file, size, and `palette` JSON.                                                                     |

Deleting a root cascades to its series and chapters only. Progress and settings survive as orphans (below). Cover rows and thumbnail files stay; they are shared by content and cost little.

### Keeping progress

Progress and settings hang off a stable identity, not off row ids or absolute paths:

- `series.ident` is `dir:<folder name>`, or `loose:<title key>` for archives loose in a root.
- `chapters.ident` is `<series ident>|<path relative to the series folder>` with `/` separators.
- Progress also stores the chapter's `file_size` as its fingerprint (for an image folder, the sum of its image sizes).

Removing a root deletes its series and chapter rows; the foreign keys null `chapter_id` and `series_id` on the progress and settings rows, which then count as orphans, and `remove_root` stamps `orphaned_at`. Every list and detail query goes through the live link, so orphans never show in the UI. During a scan, an orphan is re-linked to a chapter (or series) with the same `ident`; progress also needs the same `file_size`. That covers re-adding the same path and moving the folder under a different root, because the identity contains no root. A chapter that changes in place keeps its row, so its progress stays as before and only the stored fingerprint is refreshed.

Why this over a content hash: the scanner already knows size per chapter without opening anything, so the fingerprint costs nothing, and a rename of the folder or file (rather than a move) is the only case it cannot follow. Why not the first page hash: it needs opening every archive again. Accepted limits: a replacement file of exactly the same name and byte size inherits the progress, and two roots holding a series of the same folder name each get their own progress (an orphan is claimed once).

`Library::purge_orphans(older_than_days)` deletes orphans whose `orphaned_at` (falling back to `updated_at`) is at least that old and returns the counts. Nothing calls it automatically; the Settings screen's "Clean up hidden progress" button calls it through `library_purge_orphans`. `ident` columns for rows that predate migration 2 are backfilled when the database opens.

### Palette

`covers.palette` holds the theme seed for the cover:

```json
{ "h": 196.4, "c": 0.11, "swatches": [{ "l": 0.2, "c": 0.03, "h": 210 }, "..."], "fallback": false }
```

It is sampled once, at scan time, from the thumbnail: shrink to 40 x 60, convert each pixel to OKLCH, drop near greys and near black or white, vote into 18 hue bins weighted by chroma and closeness to mid lightness, and take the heaviest bin's circular mean hue and 80th percentile chroma (capped at 0.17). Swatches are dark, mid, seed, second hue and light. A cover with no vivid colour gets the default seed (hue 272, chroma 0.04) and `fallback: true`. This is the same method as the prototype's sampler (see `docs/design/README.md`).

## Scanner

Layout rules, loosest first:

- Each folder directly inside a root is a series. Every archive under it (up to four levels down) is a chapter, and every folder that holds images directly is a chapter. A folder named like a volume (`Vol 02`, `Tom 2`) lends its number to the chapters inside it.
- Archives loose in a root are grouped into series by the title parsed from their names, so `[Group] Title - 011.cbz` and `Title - 012.cbz` form one series.
- Hidden files, `__MACOSX`, `@eaDir`, `#recycle`, `$RECYCLE.BIN` and `System Volume Information` are skipped.

Names are parsed loosely (`naming.rs`): `Vol.02 Ch.011`, `v02c011`, `c011.5`, `[Group] Title - 011`, `Ch.001-005`, `#12`, Polish `Tom 1 Rozdział 3`, `t02 r009`, `rozdz. 12`, Japanese `第3巻` and `第11話`. Tags in brackets (groups, years, `Digital`, `[v2]`) are dropped from titles; a leading tag becomes the scan group. `ComicInfo.xml`, when an archive or folder has one, overrides the parsed series title, chapter title, number and volume, and fills summary, writer, year, language, genres, the `Manga` reading direction and the front cover page.

Chapters are ordered by number (then volume), then volume alone for volume-only releases, then natural path order.

A series summary counts `newCount`: present, unfinished chapters whose row was added after the series was last read. It drives the new chapter badge in the library and stays 0 for a series never opened.

A rescan is incremental: a chapter whose size and mtime match its row is not opened again (failed opens are retried). New and changed archives are opened in parallel without probing page sizes. Chapters that disappear are marked `missing`, never deleted, so progress survives an unplugged drive; a root that cannot be read marks everything under it missing and the scan carries on. Only one scan runs at a time.

Progress is reported as `library:scan-progress` events with `{ phase, root, done, total, current }`, throttled to one every 50 ms per phase, with the first and last of each phase always sent. Phases: `discovering`, `reading`, `covers`, `saving`, `done`.

### Watching

Every root is watched (`watcher.rs`, the `notify` crate: FSEvents on macOS, ReadDirectoryChangesW on Windows), so a new or changed chapter shows up without a manual scan. Changes are mapped to the series folder they are in, or to the loose archives of the root, and collected per root. A root is rescanned once its changes have been quiet for 1.5 s, or after 20 s of steady changes, so a bulk copy causes a few rescans rather than one per file. The rescan is the normal incremental scan narrowed to the affected series (`Library::scan_entries`), and it sends the same `library:scan-progress` events, `done` included. Hidden and junk names are ignored, and so are files directly in a root that are not archives.

- While any scan runs, collected changes wait and go into one rescan after it.
- A root that disappears (an unplugged drive, a share going away) loses its watch and its pending changes, and nothing is marked missing; that stays the job of an explicit scan. Roots are checked every 5 s; when the folder is back the watch restarts and the whole root is rescanned once to catch up.
- Adding a root starts its watch and removing one stops it (`library_add_root` and `library_remove_root` resync the watcher).

Debouncing is a small loop in the watcher thread rather than a debouncer crate, because it has to merge changes per series and hold them while a scan runs.

### Covers

One cover per series, from its first readable chapter: the page ComicInfo marks `FrontCover`, else the first page. It is downscaled to fit 400 x 600 and stored as JPEG (quality 85). The same image in two series is decoded and stored once. A cover is regenerated only when the chapter it came from changes or its file is gone from the cache.

The webview loads thumbnails through the `kirei-cover` scheme (`kirei-cover://localhost/<hash>` on macOS, `http://kirei-cover.localhost/<hash>` on Windows; `coverUrl()` in `library.ts` builds it). The hash is the only input: anything that is not 64 lowercase hex digits is refused, and `Library::cover_path` builds the file path inside the cache from the hash alone, so a request can never name a path. A hash always names the same bytes, so responses carry the hash as `ETag` and `Cache-Control: public, max-age=31536000, immutable`. The CSP allows this scheme in `img-src` and nothing else; the asset protocol stays off.

### Measured

`cargo test -p kirei-library --release --test bench -- --ignored --nocapture` builds 200 series x 25 chapters (2500 CBZ and 2500 image folders, 10 000 files) and scans it. On an Apple M3 (release build):

| Step                         | Time   |
| ---------------------------- | ------ |
| First scan (200 covers made) | 360 ms |
| Rescan, nothing changed      | 186 ms |
| Rescan, 50 archives changed  | 156 ms |
| List all series              | 3 ms   |

## Commands

| Command                       | Arguments                          | Returns                 |
| ----------------------------- | ---------------------------------- | ----------------------- |
| `library_roots`               |                                    | `LibraryRoot[]`         |
| `library_add_root`            | `path` (also starts its watch)     | `LibraryRoot`           |
| `library_remove_root`         | `id` (keeps progress and settings) | `boolean`               |
| `library_scan`                | `rootId` (null for all)            | `ScanSummary`           |
| `library_series`              |                                    | `SeriesSummary[]`       |
| `library_series_detail`       | `id`                               | `SeriesDetail \| null`  |
| `library_record_progress`     | `chapterId`, `page` (0 based)      | `ReadingProgress`       |
| `library_series_settings`     | `seriesId`                         | JSON or `null`          |
| `library_set_series_settings` | `seriesId`, `settings`             |                         |

If the database cannot be opened (for example it was written by a newer build), the app still starts and the library commands return the reason.

## Screens

The renderer side lives in `apps/desktop/src/features/library` and `features/series`.

- `libraryStore.ts` holds roots, series and the scan in flight for every screen. Adding a folder opens the system dialog, adds the root and scans it; one `library:scan-progress` listener feeds the progress panel. A finished scan bumps `version`, which makes open series pages refetch their detail.
- The grid is virtualised by hand (`gridLayout.ts`, `ShelfGrid.tsx`): every row has the same height, so the rows on screen follow from the scroll offset and only those are in the DOM. With 10 000 series about 40 tiles exist at any time. A focused tile scrolls into view, so Tab still walks the whole list.
- Search folds case and diacritics on both sides (`foldText`), so `zolta lodz` finds `Żółta łódź` and `kori` finds `Kōri`. Titles sort with the Polish collation. Filter, sort and search live in the route (`/library?filter=&sort=&q=`), so going back from a series restores the view.
- Opening a chapter goes through `useOpenChapter` (`openChapter.ts`), which navigates to `/read/$seriesId/$chapterId`. The reader owns everything after that, including landing on the saved page.
