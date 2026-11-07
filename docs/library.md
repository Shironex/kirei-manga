# Library

The local library lives in `crates/kirei-library`: a SQLite catalogue, the folder scanner that fills it, reading progress, per-series settings, and a cover cache with the palette each cover seeds the theme with. The desktop shell wraps it in thin commands (`apps/desktop/src-tauri/src/catalog.rs`) and the renderer calls them through `apps/desktop/src/lib/library.ts`.

User files are only ever read. Removing a root, or an archive vanishing, changes rows in the database and never anything on disk.

## Storage

| What           | Where                                                             |
| -------------- | ----------------------------------------------------------------- |
| Database       | `<app data>/library.sqlite3` (WAL, foreign keys on)               |
| Cover cache    | `<app data>/covers/<hh>/<hash>.jpg`                               |
| SQLite library | rusqlite with the `bundled` amalgamation, same build on every OS  |

rusqlite over sqlx: the library is synchronous by design (scans run on the rayon pool, commands on Tauri's blocking pool), so an async driver would add a runtime and compile time for nothing. `bundled` avoids depending on whatever SQLite the OS ships.

Timestamps and file mtimes are `INTEGER` Unix milliseconds (UTC), so there is one format and no time zone parsing.

## Migrations

SQL files in `crates/kirei-library/migrations/`, embedded at compile time and listed in `db.rs`. `PRAGMA user_version` records the last one applied. Each migration runs in one transaction with its version bump, so a failure leaves the previous version intact. A database from a newer build is refused rather than guessed at. Migrations are append only: never edit a shipped file, add the next number. `tests/migrations.rs` builds a v1 fixture database and opens it with the current build to prove the forward path.

## Schema (v1)

| Table              | One row per                              | Notes                                                                                                                                                              |
| ------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `library_roots`    | folder the user added                    | Canonical path, unique. Roots may not nest.                                                                                                                        |
| `series`           | series                                   | `key` is the stable identity (`dir:<folder>` or `loose:<root>:<title key>`). Title, ComicInfo metadata, `cover_hash`, `missing`.                                   |
| `chapters`         | archive or image folder                  | `path` unique, `kind` (`zip`, `rar`, `folder`), volume and number (`REAL`, so 10.5 works), `sort_order`, `page_count`, `file_size` + `file_mtime`, `missing`, `error`. |
| `reading_progress` | chapter that has been opened             | 0 based `page`, `page_count`, `completed` (sticky), `updated_at`.                                                                                                  |
| `series_settings`  | series with saved reader settings        | `settings` is a JSON blob owned by the UI (reader mode, filters, adjustments).                                                                                     |
| `covers`           | distinct cover image                     | Keyed by the BLAKE3 hash of the source image bytes. Thumbnail file, size, and `palette` JSON.                                                                     |

Deleting a root cascades to its series, chapters, progress and settings. Cover rows and thumbnail files stay; they are shared by content and cost little.

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

A rescan is incremental: a chapter whose size and mtime match its row is not opened again (failed opens are retried). New and changed archives are opened in parallel without probing page sizes. Chapters that disappear are marked `missing`, never deleted, so progress survives an unplugged drive; a root that cannot be read marks everything under it missing and the scan carries on. Only one scan runs at a time.

Progress is reported as `library:scan-progress` events with `{ phase, root, done, total, current }`, throttled to one every 50 ms per phase, with the first and last of each phase always sent. Phases: `discovering`, `reading`, `covers`, `saving`, `done`.

### Covers

One cover per series, from its first readable chapter: the page ComicInfo marks `FrontCover`, else the first page. It is downscaled to fit 400 x 600 and stored as JPEG (quality 85). The same image in two series is decoded and stored once. A cover is regenerated only when the chapter it came from changes or its file is gone from the cache.

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
| `library_add_root`            | `path`                             | `LibraryRoot`           |
| `library_remove_root`         | `id`                               | `boolean`               |
| `library_scan`                | `rootId` (null for all)            | `ScanSummary`           |
| `library_series`              |                                    | `SeriesSummary[]`       |
| `library_series_detail`       | `id`                               | `SeriesDetail \| null`  |
| `library_record_progress`     | `chapterId`, `page` (0 based)      | `ReadingProgress`       |
| `library_series_settings`     | `seriesId`                         | JSON or `null`          |
| `library_set_series_settings` | `seriesId`, `settings`             |                         |

If the database cannot be opened (for example it was written by a newer build), the app still starts and the library commands return the reason.
