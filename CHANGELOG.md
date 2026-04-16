# Changelog

All notable changes to KireiManga are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

The **Local Library** milestone (PRD §5.2). Brings first-class support for
user-provided manga (folders and CBZ/ZIP archives) alongside the existing
MangaDex library, reusing the same reader, series-detail, progress, and
library UI. CBR support is deferred to a follow-up — the roadmap's open
question on unrar licensing hasn't been resolved yet.

### Added

#### Browse discovery

- Default discovery feed on the Browse page: three tabs (Popular, Latest,
  Top rated) backed by MangaDex's `followedCount` / `latestUploadedChapter`
  / `rating` sort. Replaces the old "type to start" empty state whenever
  the search box is cleared. Active tab fetches lazily and results cache
  per-tab so switching is instant once loaded. User-facing filter chips
  (content rating, demographic, status, language) still apply to the feed.
- `In library` badge on browse cover cards for titles already followed,
  using the existing `mangadexIndex` from the library store for O(1) dedup.
- Infinite scroll on the Browse grid, on both the discovery feed and the
  keyword search. Pages load 24 at a time via an intersection-observer
  sentinel ahead of the viewport bottom; the gateway now exposes the
  MangaDex `total` / `offset` / `limit` meta so the hook knows when to
  stop. Respects the MangaDex `offset + limit ≤ 10000` ceiling.

#### Local import (Slices A–E)

- Shared `LocalArchiveFormat`, `ScanResult`, `LocalSeriesMetaPatch`, and
  `local:*` channel payloads. Migration 006 adds `local_root_path`,
  `local_content_hash`, and `local_archive_format` columns with matching
  indexes.
- Archive reader module with CBZ/ZIP (`node-stream-zip`) and folder
  implementations, image-only entry filter, natural-order sort, and a
  factory that dispatches by extension or directory stat.
- `LocalScannerService` walks a user-picked root, detects flat / nested /
  single-series layouts, infers chapter and volume numbers, and emits
  debounced `local:scan-progress` events during long scans.
- `LocalLibraryService.import` persists series + chapters transactionally
  per candidate, extracts a cover image atomically into
  `userData/covers/local/`, and skips imports whose content hash already
  matches an existing library row.
- `/library/import` route: folder picker → editorial progress bar → review
  table with per-series checkbox and inline-editable title → commit with
  toast feedback.

#### Local reading (Slices F–H)

- `kirei-cover://local/` serves extracted covers directly from disk;
  `kirei-page://local/` reads pages from archives via a wired
  `LocalLibraryService` and returns bytes with content-type preserved.
- `local:get-series`, `local:get-pages`, `local:update-series`,
  `local:update-chapter`, `local:rescan-series`, and `local:delete-series`
  gateway handlers.
- Reader route branches on source: `/reader/local/:seriesId/:chapterId`
  streams pages from local archives; existing single/double/webtoon modes,
  fit modes, and keyboard nav all work unchanged.
- Local reader progress + resume via `reader:update-local-progress` and
  `reader:get-local-resume`, with debounced writes on every page change
  and `library:updated` broadcasts so the Continue link stays fresh.

#### Library surface (Slices G · I · J · L)

- Library grid + list now render local series alongside MangaDex. Covers
  show a subtle hairline "Local" badge; the grid card routes to
  `/series/local/:id`.
- Source filter (All / MangaDex / Local) in library controls — single row
  of editorial chips matching the existing status/sort controls.
- Full local series detail page: banner with cover + title + Japanese
  title, meta row (chapter count, read count, root path, MangaDex link),
  Continue button wired to `lastChapterId`, Edit / Rescan / Remove
  actions, and a chapter list with read-state dots and in-progress page
  indicators.
- Metadata editor drawer (`Edit`): title, Japanese title, 1–10 score, and
  notes. Right-docked with scrim + body-scroll lock, ESC + click-outside
  close, save applies a partial patch to SQLite via
  `local:update-series`.
- Rescan button re-walks the series' root folder for newly-added chapters,
  inserts new rows, bumps `new_chapter_count`, and emits
  `library:updated` so the badge refreshes.

#### MangaDex enrichment (Slice K)

- "Find on MangaDex" section inside the metadata drawer: reuses
  `useMangaDexSearch` to surface the top 5 matches for the current title;
  clicking a result attaches its `mangadexId` to the local series (and
  pre-fills the title field when the user hasn't overridden it).
- Desktop `local:update-series` validates the attachment against the
  `series.mangadex_id` UNIQUE index and surfaces a typed
  `mangadex-id-taken` error when another library row already owns that
  id; the drawer renders a friendly explanation on that path.
- Series detail meta row gains a `MangaDex — linked` chip when a
  mangadexId is attached.

## [0.1.0] - 2026-04-16

First public preview — the **MangaDex Reader** milestone of the KireiManga
PRD §5.1. Local-first desktop app: a Vite/React renderer running inside an
Electron shell with an embedded NestJS backend and SQLite persistence. All
MangaDex traffic is proxied through the backend; the renderer never talks
to `api.mangadex.org` or `uploads.mangadex.org` directly.

### Added

#### Browse (Slice A)

- MangaDex HTTP client with per-endpoint rate limiting (220 ms global,
  1500 ms on `/at-home/server/{id}`), retry/backoff, and a
  `KireiManga/0.1.0` user agent.
- `mangadex:search` socket gateway with offset/limit pagination, language
  and content-rating filters, and result normalization.
- Editorial Browse page: hairline search bar, filter chips, masthead with
  result count, and a cover grid backed by the `kirei-cover://` proxy.

#### Library (Slices B–C)

- Series detail route (`/series/:mangadexId`) with banner cover, Fraunces
  title, hairline metadata row, follow toggle, tag chips, and a chapter
  list with language filter and relative dates.
- Follow / unfollow persisted in SQLite via the embedded NestJS library
  service. Optimistic toggle in the renderer with rollback + toast on
  error. `library:changed` events keep all surfaces in sync.
- Library page in two views (grid + list), sortable by title, last-read,
  date-added, and progress; filterable by reading status; client-side
  fuzzy search wired into the global TopBar input on the `/` route.
- Editorial empty state with "Browse MangaDex" CTA when no series are
  followed.

#### Reader (Slice D)

- `mangadex:get-pages` with at-home `baseUrl` rotation; preferred `data`
  quality with `dataSaver` fallback.
- `kirei-page://` custom protocol — disk-cached page proxy with atomic
  writes, path validation, and TTL-aware refetch on stale 403/404.
- Reader route (`/reader/:chapterId`) with three layouts: single page,
  double page (auto-pairs from page 2 after the cover), and webtoon
  (uninterrupted vertical scroll). Fit modes: width, height, original.
- Keyboard navigation: arrow keys / `A` / `D` (RTL-aware), `Space`,
  `Enter`, `Home`, `End`, `F` for fullscreen, number keys for fit modes.
- Auto-hiding reader chrome with chapter number and page indicator;
  preserves the frameless Electron drag region.
- Per-series reader preferences (mode, direction, fit) persisted in
  SQLite via `reader:set-prefs`.

#### Progress (Slice E)

- `reader:update-progress` writes `series.lastReadAt`,
  `chapters.lastReadPage`, and flips `chapters.isRead` once the final
  page is reached.
- Reading sessions table — opens on reader entry, closes on exit. Lays
  groundwork for stats in a future milestone.
- "Continue" buttons in the library list view and series detail jump
  back to the last page of the last open chapter.
- Read / unread / in-progress dots on chapter rows (bengara accent for
  unread; faint for read; half-filled for in-progress).

#### Offline & Updates (Slice F)

- `mangadex:download-chapter` streams every page of a chapter to
  `userData/chapters/mangadex/{chapterId}/`, emitting `download:progress`.
- `kirei-page://` protocol checks the offline cache before going to the
  network — chapters read once stay readable offline.
- Per-chapter download state surfaced on the chapter list (idle /
  downloading / downloaded) with a download button and offline glyph.
- Followed-series update poller — runs at startup and every 6 h, polls
  `/manga/{id}/feed` per followed series with a one-request-per-second
  budget, persists "new since last check," and emits
  `library:updates-available`.
- New-chapter badges on library tiles when followed series have unread
  releases.

#### Bookmarks & Settings (Slice G)

- Bookmark CRUD over the SQLite `bookmarks` table; `B` toggles a
  bookmark on the current reader page; corner indicator marks
  bookmarked pages.
- Bookmarks panel in series detail, grouped by chapter, jump-to-page on
  click.
- Settings hub with four sections: Appearance (theme: sumi / washi,
  font size, reading font), Reader Defaults (mode, direction, fit,
  default chapter language), Library (default chapter language, cache
  size + clear-cache button), and Keyboard (read-only shortcut map for
  v0.1, customisation lands later).
- Settings persisted via `electron-store` and hydrated on boot;
  optimistic patches in the renderer, rolled back on backend error.

#### i18n

- Tiny dependency-free i18n layer: flat per-language string records
  (`apps/web/src/i18n/{en,pl}.ts`) and a `useT()` hook that reads
  `settings.language` and resolves `{var}` placeholders.
- Sidebar, TopBar, Library page, Toast eyebrows, and the Settings
  shell are migrated. Browse, SeriesBanner, ChapterList, and Reader
  chrome are scheduled for a follow-up `chore(web): complete i18n pass`.
- Polish dictionary shipped with a non-native draft — flagged for
  review before v0.2 (see `apps/web/src/i18n/pl.ts`).
- Language picker in Settings → Appearance, wired through to
  `settings.language`.

### Infrastructure

- pnpm workspace monorepo: `apps/desktop` (Electron + NestJS),
  `apps/web` (Vite + React + Tailwind 4), `packages/shared` (types,
  IPC enums, constants).
- Shared types and `*.Events` enums for every socket channel — single
  source of truth across the boundary.
- Custom protocols (`kirei-cover://`, `kirei-page://`) registered as
  `bypassCSP: false` and `secure: true`; renderer never sees an
  `https://uploads.mangadex.org` URL.
- Strict CSP in production; `https://api.mangadex.org` and
  `https://uploads.mangadex.org` are reachable only from the main
  process.
- `electron-builder.json`: `extraResources` ships the renderer bundle
  outside `app.asar`; `publish` is intentionally `null` to prevent
  accidental GitHub release on first invocation.
- Jest desktop test backend swapped from `better-sqlite3` (native) to
  `sql.js` (pure-WASM) so unit tests run anywhere without a node-gyp
  toolchain. 46 tests across 4 suites, all green.
- GitHub Actions release workflow scaffolded (disabled until packaging
  blockers below clear).

### Known Issues / Follow-ups

- **Application icons are not committed.** `apps/desktop/resources/`
  ships only a `README.md` describing the required `icon.icns`,
  `icon.ico`, and `icon.png` artwork. Packaging
  (`pnpm package` / `pnpm package:mac` / `pnpm package:win`) will fail
  until those files exist. Generating them is a release blocker for
  v0.1 distribution.
- **i18n coverage is partial.** Browse, SeriesBanner, ChapterList,
  Reader chrome, and several Settings copy strings still hard-code
  English. A dedicated `chore(web): complete i18n pass` will close the
  gap. Look for the `// TODO(i18n)` marker in
  `apps/web/src/pages/Browse.tsx`.
- **Polish translations are unreviewed.** The strings in
  `apps/web/src/i18n/pl.ts` were drafted by a non-native speaker;
  comment at the top of the file flags the review requirement.
- **Test backend is `sql.js`, not `better-sqlite3`.** Production uses
  `better-sqlite3`; test runs use `sql.js`. SQL features (FTS5, custom
  collations) added later must be checked against both engines or the
  test seam revisited.
- No telemetry, no auto-update channel wired up — `electron-updater`
  is installed but not invoked. By design for v0.1.
