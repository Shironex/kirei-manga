# 綺麗漫画 · KireiManga

> Read any manga, in any language.

KireiManga is a local-first desktop manga reading companion. It browses MangaDex, manages a local manga library in SQLite, and (in later milestones) overlays real-time OCR + machine translation directly on raw Japanese pages. KireiManga is part of the Shiro suite alongside [ShiroAni](https://github.com/Shironex/shiroani) (anime) and Shiranami (music), sharing design language and monorepo patterns.

---

## Tech stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 40+ |
| Backend | NestJS 11 (embedded in the Electron main process) |
| Frontend | React 18, Vite 7, Tailwind CSS 4 |
| Database | better-sqlite3 |
| State management | Zustand |
| UI primitives | Radix UI, Lucide Icons |
| Routing | React Router (hash router) |
| Real-time | Socket.IO (over localhost) |
| Native addon | C++ via `node-addon-api` (OpenCV for bubble detection, v0.3) |
| OCR | `manga-ocr` Python sidecar, PyInstaller bundle (v0.3) |
| Translation | DeepL / Google Translate / Ollama (v0.3) |
| Package manager | pnpm + pnpm workspaces |
| Tests | Jest (desktop), Vitest (web / shared) |
| CI/CD | GitHub Actions, electron-builder |

---

## Monorepo layout

```
kirei-manga/
├── apps/
│   ├── desktop/              # Electron main process + embedded NestJS backend
│   │   ├── src/
│   │   │   ├── main/         # Electron bootstrap, window, updater, protocols
│   │   │   │   └── protocols/  # kirei-cover: and kirei-page: handlers
│   │   │   └── modules/      # NestJS modules
│   │   │       ├── database/   # better-sqlite3 + migrations
│   │   │       ├── mangadex/   # MangaDex API client (stub in v0.1)
│   │   │       ├── library/    # Local library service (stub in v0.1)
│   │   │       └── shared/     # CORS, throttler, gateway helpers, io adapter
│   │   └── electron-builder.json
│   └── web/                  # React + Vite frontend (renderer)
│       └── src/
│           ├── components/layout/  # AppShell, Sidebar, TopBar
│           ├── pages/              # Library, Browse, Settings, Reader
│           ├── lib/                # socket, socketHelpers, utils
│           ├── stores/             # Zustand stores (socket-store)
│           └── styles/globals.css
├── packages/
│   └── shared/               # Shared types, IPC channels, logger, constants
├── native/
│   └── bubble-detector/      # C++ NAPI addon stub (empty Array in v0.1)
├── sidecar/
│   └── manga-ocr/            # Python OCR sidecar scaffold (v0.3)
├── scripts/                  # version-bump, set-version-ci, native-build
└── docs/
    └── kireimanga-prd.md     # Full product requirements document
```

---

## Dev commands

Install once:

```bash
pnpm install
```

Day-to-day checks (no dev servers required):

```bash
pnpm build:packages                           # compile @kireimanga/shared
pnpm --filter @kireimanga/web build           # build renderer
pnpm --filter @kireimanga/desktop typecheck   # typecheck main + backend
pnpm typecheck                                # typecheck everything
pnpm build                                    # full workspace build
pnpm test                                     # run all test suites
pnpm lint                                     # eslint
pnpm format                                   # prettier --write
```

Packaging (Electron + native addon, Windows/macOS):

```bash
pnpm --filter @kireimanga/desktop package:win
pnpm --filter @kireimanga/desktop package:mac
```

Version bump:

```bash
pnpm version:patch            # 0.1.0 -> 0.1.1 + commit + tag
pnpm version:minor
pnpm version:major
```

---

## Roadmap

Derived from the [PRD §13](docs/kireimanga-prd.md). All dates are approximate.

| Milestone | Scope |
|---|---|
| **v0.1 — MangaDex Reader** *(current)* | MangaDex API, chapter streaming, internal library (follows, status, progress), reader shell |
| v0.2 — Local Library | CBZ / CBR / folder scanning, unified local + MangaDex library view |
| v0.3 — Translation | C++ bubble detection, `manga-ocr` sidecar, DeepL / Google / Ollama overlay |
| v0.4 — AniList Sync | OAuth, read-progress sync, manga-list import |
| v0.5+ — Polish | Kanji hover dictionary, Anki export, translation corrections, Linux build |

---

## License

Source-available — see [LICENSE](LICENSE). Personal use and contributions via pull requests are permitted; redistribution and derivative works are not.
