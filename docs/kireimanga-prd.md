# 綺麗漫画 · KireiManga
## Product Requirements Document (PRD)
**Version:** 0.1 · **Status:** Draft  
**Author:** Shironex  
**Stack:** Electron · React · TypeScript · NestJS · better-sqlite3 · C++ (node-addon-api)

---

## 1. Vision

KireiManga is a **daily-use desktop manga reading companion** — a polished, local-first Electron app that lets you read manga from your local library and from MangaDex, with an optional real-time Japanese OCR + translation overlay that renders translated speech bubbles directly on the page.

It is part of the **Shiro suite** alongside ShiroAni (anime) and Shiranami (music), sharing the same AniList account, design language, and monorepo patterns.

> *"Read any manga, in any language."*

---

## 2. Goals

| Goal | Description |
|---|---|
| **Daily habit** | Become the app users open every time they read manga, not a one-off tool |
| **Local-first** | All reading data stored locally in SQLite, works fully offline |
| **Translation** | First desktop manga reader with real-time OCR + translation overlay |
| **AniList sync** | Automatically sync reading progress with user's AniList account |
| **Suite fit** | Reuse architecture, UI components, and auth patterns from ShiroAni |

---

## 3. Non-Goals

- No manga hosting or illegal content sourcing
- No manga scraping from sites other than MangaDex's official API
- No built-in downloader for piracy sites (Nyaa, etc.)
- No server/multi-user features (single-user desktop app)
- No mobile version (desktop only: Windows primary, macOS secondary)

---

## 4. Target Users

- Anime fans with a local CBZ/CBR manga library
- Readers who use MangaDex and want a cleaner desktop experience
- Japanese learners who read raw manga and want translation assistance
- Polish / non-English users where official manga licenses are limited
- Users already using ShiroAni (built-in cross-promotion)

---

## 5. Feature Scope

### 5.1 MVP (v0.1 — MangaDex Reader)

The first shippable version is a clean, fast manga reader built around MangaDex. No local library, no AniList.

**MangaDex Integration**
- Browse MangaDex catalog via official API (no scraping)
- Search by title, author, tags, demographic, content rating
- Read chapters directly in-app with online page streaming
- Offline cache: download chapters for offline reading (stored locally in app data)
- Chapter update notifications for followed series
- Language filter for chapters (EN, PL, JP, etc.)

**Internal Library (MangaDex-backed)**
- Follow/unfollow series — stored locally in SQLite
- Reading status per series: reading, completed, plan to read, on hold, dropped
- Auto-track reading progress (last read chapter + page)
- Resume from last read page on app open
- Bookmarks per page

**Series Details Panel**
- MangaDex metadata: synopsis, genres, author, artist, status, rating
- Chapter list with read/unread state, language filter
- Cover and banner image
- New chapter badges

**Reader**
- Full-screen reader with keyboard navigation (arrow keys, A/D, space)
- Reading modes: single page, double page (auto-detect cover), webtoon vertical scroll
- RTL / LTR direction toggle per series
- Fit modes: fit width, fit height, original size
- Zoom in/out with scroll wheel
- Page preloading for smooth transitions
- Bookmarks per page

**Library View**
- Grid view with covers
- List view with chapter progress
- Sort by: title, last read, date added, progress
- Filter by: reading status
- Search followed series by title

**Settings**
- Theme (dark/light, custom accent colors)
- Default reading mode
- Keyboard shortcut customization
- Default chapter language
- Language: English / Polish

---

### 5.2 v0.2 — Local Library

**Local Library**
- Import folders of images or CBZ / CBR / ZIP archives
- Scan a root folder recursively and auto-detect manga series
- Store library metadata in SQLite (title, cover, chapter list, reading progress)
- Manual metadata edit (title, cover image, series grouping)
- Unified library view — local and MangaDex series together
- Match local series to MangaDex entry for metadata enrichment (optional)

---

### 5.3 v0.3 — Translation Engine (Core Feature)

The translation pipeline runs entirely locally except for the translation API call.

**Pipeline overview:**
```
Page image
  → C++ / OpenCV: speech bubble region detection
  → manga-ocr Python sidecar: Japanese OCR per bubble
  → DeepL / Google Translate API: translate text
  → SQLite cache: store result by page hash + bubble coords
  → Canvas overlay: render translated text over original bubbles
```

**Bubble Detection (C++ native module)**
- OpenCV-based contour detection for white/light speech bubble regions
- Filter out screen tones, panel borders, and non-bubble shapes
- Return list of bounding polygons per page
- Runs in a worker thread, does not block the UI

**OCR (manga-ocr Python sidecar)**
- `manga-ocr` ML model — specifically trained on manga fonts, vertical text, stylized fonts
- Bundled as a prebuilt binary / PyInstaller executable shipped with the app
- Communicates via IPC (stdin/stdout or named pipe) to avoid Python env requirements for the user
- Fallback: Tesseract (JP) if manga-ocr binary fails

**Translation**
- Primary: DeepL API (user provides their own free API key — 500k chars/month)
- Secondary: Google Translate API (user provides key)
- Tertiary: Local model via Ollama (fully offline, lower quality)
- Target languages: English (default), Polish, and any language DeepL supports
- Per-series language override

**Translation Cache**
- Cache key: SHA256 of page image + bubble bounding box
- Stored in SQLite alongside library data
- Never re-translates the same page/bubble combination
- Cache is portable (follows library folder)

**Overlay UI**
- Translated text boxes rendered on canvas over the original page
- Text auto-fits to bubble bounding box (font size scales down)
- Toggle: show translation / show original / show both (split)
- Click a bubble to see original Japanese text
- Copy original or translated text to clipboard
- Report bad translation (flag for manual correction, stored locally)

**Translation Settings**
- Enable/disable translation per series
- Choose translation provider
- Choose target language
- Font family and size for overlay text
- Overlay background opacity (0–100%)
- Auto-translate on page load vs manual trigger

---

### 5.4 v0.4 — AniList Sync

**AniList Integration**
- Login with AniList OAuth
- Import user's manga list (reading, completed, plan to read, etc.)
- Auto-sync reading progress: mark chapters read on AniList as you read
- Display AniList score and status per series in library
- Push local progress back to AniList

---

### 5.5 Future (v0.5+)

- Kanji hover dictionary (JMdict lookup on OCR'd text)
- Anki export: export OCR'd sentence + page screenshot as flashcard
- Custom translation corrections editor (override bad OCR/translation per page)
- Export translated chapter as new CBZ with overlaid text baked in
- Community translation sharing (opt-in: share your cached translations)
- macOS auto-updates

---

## 6. Architecture

KireiManga follows the **same monorepo structure as ShiroAni**. The codebase from ShiroAni should be analyzed for:

- Electron main process setup (app lifecycle, IPC, auto-updater)
- Embedded NestJS backend (IPC bridge, SQLite integration via better-sqlite3)
- React + Vite + Tailwind CSS 4 frontend setup
- C++ native module scaffolding (node-addon-api, binding.gyp, prebuild scripts)
- AniList OAuth flow
- CI/CD pipeline (GitHub Actions, electron-builder config)
- Shared packages structure (types, constants, utilities)

```
kirei-manga/
├── apps/
│   ├── desktop/           # Electron main process + NestJS embedded backend
│   │   ├── src/
│   │   │   ├── main/      # Electron main process
│   │   │   ├── api/       # NestJS modules
│   │   │   │   ├── library/        # Local library management
│   │   │   │   ├── reader/         # Reading progress, bookmarks
│   │   │   │   ├── mangadex/       # MangaDex API client
│   │   │   │   ├── anilist/        # AniList OAuth + sync
│   │   │   │   ├── translation/    # Translation pipeline orchestrator
│   │   │   │   └── cache/          # Translation cache service
│   │   │   └── native/    # C++ addon bridge (bubble detection)
│   └── web/               # React + Vite frontend
│       ├── src/
│       │   ├── pages/
│       │   │   ├── library/        # Library grid/list view
│       │   │   ├── reader/         # Full-screen reader + overlay
│       │   │   ├── series/         # Series detail panel
│       │   │   ├── browse/         # MangaDex browse/search
│       │   │   └── settings/       # App settings
│       │   ├── components/
│       │   │   ├── reader/         # Page renderer, canvas overlay, controls
│       │   │   ├── library/        # Cover grid, list row, progress bar
│       │   │   └── shared/         # Buttons, modals, etc.
│       │   └── store/              # Zustand state management
├── packages/
│   └── shared/            # Shared types, enums, IPC event names
├── native/
│   └── bubble-detector/   # C++ OpenCV addon (node-addon-api)
│       ├── src/
│       │   └── detector.cpp
│       ├── binding.gyp
│       └── package.json
├── sidecar/
│   └── manga-ocr/         # Python sidecar build scripts
│       ├── build.py        # PyInstaller build script
│       └── main.py         # OCR server (stdin/stdout IPC)
└── scripts/               # Build, version, sidecar bundling scripts
```

---

## 7. Data Model

```typescript
// Series — a manga title
interface Series {
  id: string                  // UUID
  title: string
  titleJapanese?: string
  coverPath?: string          // Local path or cached URL
  source: 'local' | 'mangadex'
  mangadexId?: string
  anilistId?: number
  status: ReadingStatus       // reading | completed | planToRead | onHold | dropped
  score?: number              // 1–10
  notes?: string
  addedAt: Date
  lastReadAt?: Date
}

// Chapter
interface Chapter {
  id: string
  seriesId: string
  title?: string
  chapterNumber: number
  volumeNumber?: number
  source: 'local' | 'mangadex'
  mangadexChapterId?: string
  localPath?: string          // Folder or archive path
  pageCount: number
  isDownloaded: boolean
  isRead: boolean
  lastReadPage: number
  readAt?: Date
}

// Translation cache entry
interface TranslationCache {
  id: string
  pageHash: string            // SHA256 of page image bytes
  bubbleIndex: number         // Index of bubble on this page
  boundingBox: BoundingBox    // { x, y, w, h }
  originalText: string        // OCR result
  translatedText: string
  targetLanguage: string      // 'en' | 'pl' | etc.
  provider: string            // 'deepl' | 'google' | 'ollama'
  createdAt: Date
}

// Reading session (for progress tracking)
interface ReadingSession {
  id: string
  chapterId: string
  startPage: number
  endPage: number
  startedAt: Date
  endedAt?: Date
  durationSeconds: number
}
```

---

## 8. IPC Contract (Electron ↔ NestJS)

All communication between the Electron renderer and the NestJS backend uses IPC channels. Follow the same pattern as ShiroAni.

```typescript
// Internal library (MangaDex-backed, stored in SQLite)
'library:get-all'            // () => Series[]
'library:get-series'         // (id: string) => Series
'library:follow'             // (mangadexId: string) => Series
'library:unfollow'           // (id: string) => void
'library:update-status'      // (id: string, status: ReadingStatus) => Series
'library:update-progress'    // (id: string, chapterId: string, page: number) => void

// MangaDex
'mangadex:search'            // (query: string, filters: SearchFilters) => SearchResult[]
'mangadex:get-series'        // (mangadexId: string) => MangaDexSeries
'mangadex:get-chapters'      // (mangadexId: string, lang: string) => Chapter[]
'mangadex:get-pages'         // (chapterId: string) => string[]
'mangadex:download-chapter'  // (chapterId: string) => void (streams progress events)
'mangadex:check-updates'     // () => SeriesUpdate[]

// Local library (v0.2)
'local:scan-folder'          // (path: string) => Series[]
'local:get-pages'            // (chapterId: string) => string[] (local file paths)
'local:update-series'        // (id: string, data: Partial<Series>) => Series
'local:delete-series'        // (id: string) => void

// AniList (v0.3)
'anilist:login'              // () => void (opens OAuth window)
'anilist:get-list'           // () => AniListEntry[]
'anilist:sync-progress'      // (anilistId: number, chapter: number) => void

// Chapters (shared)
'chapter:mark-read'          // (chapterId: string) => void
'chapter:add-bookmark'       // (chapterId: string, page: number) => void
'chapter:get-bookmarks'      // (chapterId: string) => Bookmark[]

// Translation (v0.4)
'translation:detect-bubbles' // (pageImagePath: string) => BoundingBox[]
'translation:ocr-page'       // (pageImagePath: string, boxes: BoundingBox[]) => OcrResult[]
'translation:translate'      // (texts: string[], targetLang: string) => string[]
'translation:get-cache'      // (pageHash: string) => TranslationCache[]
```

---

## 9. Native Module: Bubble Detector

The C++ module handles speech bubble detection using OpenCV.

**Input:** path to a page image (PNG/JPG)  
**Output:** array of bounding boxes `{ x, y, w, h, confidence }`

**Algorithm:**
1. Load image via OpenCV
2. Convert to grayscale
3. Apply adaptive thresholding to separate white bubbles from screentone backgrounds
4. Find contours
5. Filter by: area (min/max), aspect ratio, circularity / convexity
6. Return filtered bounding boxes sorted top-left to bottom-right (natural reading order)

**Build target:** prebuild for Windows x64 (primary), macOS arm64 + x64

```cpp
// Native binding signature
Napi::Value DetectBubbles(const Napi::CallbackInfo& info) {
  // args[0]: string imagePath
  // returns: Array of { x, y, w, h, confidence }
}
```

---

## 10. Sidecar: manga-ocr

The Python OCR engine runs as a separate process bundled with the app.

**Communication:** stdin/stdout JSON protocol  
**Request:** `{ "image_path": "...", "boxes": [{ "x": 0, "y": 0, "w": 100, "h": 50 }] }`  
**Response:** `{ "results": [{ "box_index": 0, "text": "テキスト" }] }`

**Bundling:**
- Built with PyInstaller into a single executable
- Shipped inside `resources/sidecar/` in the Electron package
- Launched by NestJS on app start, kept alive as a child process
- Restarted automatically on crash

**Fallback:** If sidecar fails to start, translation feature is disabled with a clear error message. The rest of the app continues working normally.

---

## 11. Codebase References to Analyze

When starting a new session to analyze existing codebases, focus on the following:

### ShiroAni (Primary Reference)

Areas to study:
- `apps/desktop/src/main/` — Electron main process, window management, auto-updater
- NestJS embedded backend setup and IPC bridge pattern
- AniList OAuth implementation
- C++ native module build setup (binding.gyp, prebuild, node-addon-api usage)
- SQLite integration via better-sqlite3
- Electron-builder config (Windows installer, auto-update, code signing)
- GitHub Actions CI/CD pipeline
- Zustand store patterns in the React frontend
- Theme system (39 themes, custom theme editor)

### Shiranami (Secondary Reference)

Areas to study:
- Local file library management (how local audio files are scanned/indexed)
- File system watcher implementation
- Cover art / metadata extraction
- Library data model and SQLite schema

---

## 12. Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40+ |
| Backend | NestJS 10 (embedded in Electron main) |
| Frontend | React 18, Vite 7, Tailwind CSS 4 |
| Database | better-sqlite3 |
| State management | Zustand |
| UI components | Radix UI, Lucide Icons |
| Native addon | C++ via node-addon-api (OpenCV for bubble detection) |
| OCR | manga-ocr (Python sidecar, PyInstaller bundle) |
| Translation | DeepL API / Google Translate API / Ollama (local) |
| Image processing | OpenCV (C++) + sharp (JS, for page preloading/resizing) |
| Archive reading | node-stream-zip (CBZ), node-rar (CBR) |
| Real-time | Socket.IO (same as ShiroAni) |
| Tests | Jest, Vitest |
| CI/CD | GitHub Actions |
| Package manager | pnpm + pnpm workspaces |

---

## 13. Milestones

| Milestone | Scope | Target |
|---|---|---|
| v0.1 — MangaDex Reader | MangaDex API, chapter streaming, reader, offline cache, internal library | Week 1–2 |
| v0.2 — Local Library | CBZ/folder reader, local series management, unified library view | Week 3–4 |
| v0.3 — Translation | Bubble detection, manga-ocr, DeepL overlay | Week 5–7 |
| v0.4 — AniList Sync | OAuth, progress sync, import/export manga list | Week 8 |
| v0.5 — Polish | Dictionary hover, Anki export, perf improvements | Week 9+ |

---

## 14. Open Questions

- Should offline chapter cache be stored in app data or a user-configurable folder?
- MangaDex rate limits — should chapter page fetching be queued/throttled to avoid API bans?
- Should KireiManga support MangaDex user accounts (OAuth) for syncing follows server-side, or keep everything local only?
- Should the translation cache be portable with the chapter cache or centralized in app data?
- Should Ollama local translation require the user to install Ollama separately, or ship a bundled model?
- What is the licensing model — fully open source or source-available like ShiroAni?

---

*End of PRD v0.1*