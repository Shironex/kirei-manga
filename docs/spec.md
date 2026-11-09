# KireiManga rewrite spec

Status: decided 2026-11-07. This document is the source of truth for the rewrite. The old Electron code and the roadmaps in `docs/legacy/` are reference only.

## Goal

KireiManga becomes a portfolio showcase: a fast, beautiful, local-first manga reader for Windows and macOS, built from scratch in Tauri 2 and Rust. The domain kireimanga.app is already paid for and the old app is dead. The rewrite shows a Rust core (streaming archives, decode pipeline, SQLite), a polished React UI, and 3D on the web (landing hero, mascot). It keeps the name, the domain and the Kirei mascot as an accent, with a new visual system.

Why a rewrite: no Tauri/Rust manga reader has traction, scraper-based readers keep breaking when sites change, and a Rust decode path gives measurable wins (cold start, RAM, page turn latency) over Electron readers.

## Hard rules

- No scraper sources, ever. Only APIs and local files (MangaDex API, local archives and folders).
- MangaDex acceptable use: credit MangaDex, credit the scanlation groups on every chapter that is read, no ads, no paid access to API content, honor takedown requests.
- Never delete user files without confirmation and a trash or undo path.
- Committed code, comments and docs read as native to this project (no "ported from" notes).

## Stack

- Shell: Tauri 2. Core: Rust crate workspace.
- UI: React 19, Vite, Tailwind CSS v4, shadcn/ui. TypeScript strict, ESM.
- Monorepo: pnpm workspace plus Cargo workspace. Tooling is modeled on the sister project Shiranami: Husky, lint-staged, commitlint, ESLint flat config, Prettier, Vitest, `rust-toolchain.toml`, clippy and rustfmt config, separate JS and Rust CI workflows.
- Planned layout:
  - `crates/kirei-archive`: streaming CBZ, ZIP, CBR and folder access, no extraction
  - `crates/kirei-reader`: decode-ahead page pipeline, resampling, adjustments
  - `crates/kirei-library`: SQLite schema, scanner, cover cache, palette extraction
  - `crates/kirei-core`: shared types, settings, paths, portable mode, backup
  - `crates/kirei-mangadex`, `crates/kirei-anilist`, `crates/kirei-download`
  - `apps/desktop`: the Tauri app and React UI
  - `apps/landing`: Astro site
  - `packages/`: shared TypeScript (contracts, UI tokens)
- The old Electron code (`apps/*`, `native/`, `sidecar/`) is removed when the scaffold lands. Old master is tagged `legacy-electron`.

## Releases

Update 2026-11-09: the release plan changed. MangaDex, downloads and AniList, the reader comfort options, the command palette, reading stats and collections all ship in 1.0, so 1.0 is a full release rather than a foundation. The earlier plan (1.0 Foundation, then 1.1 Online) is kept in the decisions list below. What follows is the plan as it stands.

### 1.0

- Scaffold, CI and tooling; design system from the approved prototype; app shell and routing.
- Streaming archive access: CBZ, ZIP, CBR, folders, never extracted to disk.
- Decode-ahead page pipeline with a custom protocol serving pages to the webview, bounded cache, viewport-sized decode.
- Reader modes: paged LTR and RTL, double page with spread detection, webtoon continuous.
- Reader comfort: resampling filters (lanczos3, mitchell, nearest), image adjustments (brightness, contrast, saturation, sharpen, invert, grayscale, sepia) with per-title memory, webtoon detection, tall strip splitting, chapters that run into the next, remappable keys.
- Library: SQLite, folder scanner with loose naming and ComicInfo.xml, folder watcher, persistent cover cache, series detail, continue reading.
- Cover-derived theming (palette sampled at scan time), also on the reader chrome.
- Collections, tags, Want to Read and smart filters; command palette; reading stats with a year in review card.
- MangaDex browse and follow, Polish first (language fallback chain pl, en, "only my language" toggle), grouped new-chapter feed, read marker sync, scheduled refresh and notifications.
- Offline downloads to CBZ with ComicInfo.xml, resumable queue with rate controls, data-saver option.
- Credits to MangaDex and scanlation groups in the reader and on series pages.
- AniList tracking with progress sync.
- Portable mode, backup and restore, settings.
- Release pipeline: updater, GitHub releases for Windows and macOS. Code signing and notarization are supported by the workflow but off by default (see `docs/release.md`).
- New Astro landing with an R3F hero and static fallback.
- README rewrite and the master swap.

### 1.1 Comfort

- Credit and ad page detection (perceptual hashing) with a "skip these pages" option.
- Spoiler guard and privacy: blur unread covers, incognito, hidden categories.
- Optional 3D shelf view (a toggle, never the default).

### 1.2 Showcase

- Local AI upscaling (ONNX or ncnn, per-series toggle, cached prefetch; check model licenses first).
- 3D mascot moments.

## Look and feel

Dark cinematic gallery: near-black surfaces, large covers, glass panels, colors sampled from the current cover (library, series detail, reader chrome). Kirei the mascot is an accent, not the identity. Contrast is checked in the design system (WCAG AA minimum). Reader chrome auto-hides, with edge tap zones and keyboard shortcuts. An approved HTML prototype is the design source for the tokens.

## 3D plan

Models come from Tripo through Maquette, optimized to glTF with KTX2 textures.
- Landing hero: an R3F island with DPR and GPU gating, correct disposal, and a static image fallback for no-WebGL, reduced motion and low-end devices.
- Kirei mascot: a 3D model used on the landing and in the app (empty states, about, moments in 1.2).
- Shelf view: optional in-app 3D bookshelf toggle in 1.1.

## Platforms

Windows and macOS only (arm64 and x64 on macOS). No Linux build for now.

## Data and migration

Clean start. There is no migration from v0.2 data. Backups use a documented portable file and restore is tested.

## Landing

Astro with a React Three Fiber island and a static fallback, served from a non-root container on Coolify. Until it is ready, the live site shows a coming-soon maintenance page.

## Process

- One GitHub milestone per release.
- One issue per slice with goal, scope, acceptance criteria, dependencies and out of scope.
- One PR per slice, rebase merge only, never squash. PRs targeted `rewrite/tauri` until the 1.0 master swap; after 1.0, PRs target `master`.
- Small conventional commits, always scoped. PR titles follow the same shape.
- Labels: a type label, an `area:*` label, a `release:*` label and a priority.

## Decisions taken

1. Rewrite from scratch in Tauri 2 and Rust, same public repo, branch `rewrite/tauri`, master swapped at 1.0, old master tagged `legacy-electron`.
2. The v0.3 translation engine stays dropped. No scraper sources.
3. Keep the name, domain and Kirei mascot; new dark cinematic gallery identity.
4. Four releases: 1.0 Foundation, 1.1 Online, 1.2 Comfort, 1.3 Showcase. Superseded on 2026-11-09: Online, downloads, AniList, reader comfort, the command palette, stats and collections moved into 1.0, and the remaining releases are 1.1 Comfort and 1.2 Showcase.
5. MangaDex is the only online source, Polish first.
6. 3D via Tripo and Maquette: landing hero, mascot, optional shelf view.
7. Windows and macOS only; clean start with no v0.2 migration.
8. Landing is Astro plus R3F with a static fallback.
9. Merging: rebase only, one PR per slice, merge after green CI and a diff review.
10. Tooling and conventions copied from Shiranami.
