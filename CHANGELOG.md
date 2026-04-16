# Changelog

All notable changes to KireiManga are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
