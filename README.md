<a name="top"></a>

<div align="center">
  <img src="assets/icon.png" alt="KireiManga" width="128" height="128" />

  <h1>綺麗漫画 &nbsp;·&nbsp; KireiManga</h1>

  <p><strong>Read any manga, in any language.</strong></p>

  <p>
    <a href="https://github.com/Shironex/kirei-manga/releases/latest">
      <img src="https://img.shields.io/github/v/release/Shironex/kirei-manga?style=flat&color=blue" alt="GitHub Release" />
    </a>
    <a href="https://github.com/Shironex/kirei-manga/releases">
      <img src="https://img.shields.io/github/downloads/Shironex/kirei-manga/total?style=flat&color=green" alt="Downloads" />
    </a>
    <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-lightgrey" alt="Platform" />
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-Source%20Available-orange" alt="License" />
    </a>
  </p>

  <p>
    <a href="https://github.com/Shironex/kirei-manga/releases/latest"><strong>Download</strong></a>
  </p>

  <p>
    <a href="#english">English</a> · <a href="#polski">Polski</a>
  </p>

  <blockquote>
    <p>Kirei is still shelving her books — the app is in early development. Some edges are rough, but every release brings the library closer to home.</p>
  </blockquote>
</div>

---

<a name="english"></a>

<details open>
<summary><h2>English</h2></summary>

### What is KireiManga?

KireiManga is a local-first desktop manga reader. It browses MangaDex through the official API, keeps a personal library in SQLite, and lets you read CBZ and folder-based manga from your own shelf alongside it. A future milestone adds a real-time OCR + translation overlay for raw Japanese pages. It is part of the **Shiro suite** alongside [ShiroAni](https://github.com/Shironex/shiroani) (anime) and Shiranami (music), sharing design language and monorepo patterns.

Editorial ink-and-paper aesthetic. OKLCH sumi / kinari / bengara palette. Fraunces, Shippori Mincho, Geist. No dashboards. No neon. Just a quiet place to read.

### Screenshots

<p align="center">
  <img src="assets/splashscreen.png" alt="Splash screen" width="512" />
  <br />
  <em>Kirei reads quietly while the app wakes up</em>
</p>

> More screenshots arrive once the v0.2 **Local Library** milestone is cut — import flow, series detail, reader in action.

### What's inside

|                              |                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| **MangaDex Browse**          | Search by title, author, tag, demographic, or rating through MangaDex's official API               |
| **Internal Library**         | Follow / unfollow, reading status (reading, completed, plan to read, on hold, dropped)             |
| **Local Import (v0.2)**      | Scan a folder, import CBZ / ZIP / image-directory series alongside MangaDex                        |
| **Reader**                   | Full-screen reader with single / double / webtoon modes, fit modes, and keyboard navigation        |
| **Right-to-Left**            | Per-series reading direction preference                                                            |
| **Progress Tracking**        | Resume where you left off on every chapter — works for MangaDex and local series                   |
| **Offline Cache**            | Downloaded chapters are served from disk, no network needed                                        |
| **Bookmarks**                | Per-page bookmarks with optional notes                                                             |
| **New-Chapter Badges**       | Background update polling for followed series + on-demand rescan for local folders                 |
| **Translation Overlay (v0.3)** | C++ OpenCV bubble detection + `manga-ocr` sidecar + DeepL / Google / Ollama rendering on page    |
| **AniList Sync (v0.4)**      | OAuth login, list import, two-way progress sync                                                    |
| **i18n**                     | English and Polish out of the box                                                                  |

### Getting started

Grab the latest version for your system from [Releases](https://github.com/Shironex/kirei-manga/releases/latest).

#### Windows

1. Download the `.exe` installer.
2. Run it — Windows might show a SmartScreen warning since the app isn't code-signed. Click **"More info"** then **"Run anyway"**.
3. That's it.

#### macOS

1. Download the `.dmg` file.
2. Open it and drag KireiManga to your Applications folder.
3. macOS will block it because it's not code-signed. Open Terminal and run:
   ```bash
   xattr -cr /Applications/KireiManga.app
   ```
4. Auto-updates aren't available on macOS yet, so grab new versions manually from [Releases](https://github.com/Shironex/kirei-manga/releases).

#### Linux

Coming later. The codebase has Linux-specific hooks but no packaged build yet.

### Built with

|           |                                                                    |
| --------- | ------------------------------------------------------------------ |
| Desktop   | Electron 40                                                        |
| Backend   | NestJS 11 (embedded in the Electron main process)                  |
| Frontend  | React 18, Vite 7, Tailwind CSS 4                                   |
| Database  | better-sqlite3                                                     |
| UI        | Radix UI, Lucide Icons, custom editorial design system             |
| Real-time | Socket.IO (over localhost)                                         |
| State     | Zustand                                                            |
| Archives  | node-stream-zip (CBZ / ZIP), JSZip (test fixtures)                 |
| Native    | C++ via node-addon-api (OpenCV bubble detection, v0.3)             |
| OCR       | `manga-ocr` Python sidecar, PyInstaller bundle (v0.3)              |
| Quality   | ESLint, Prettier                                                   |
| Tests     | Jest (desktop + integration)                                       |
| CI/CD     | GitHub Actions, electron-builder                                   |

### Building from source

You'll need:

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10
- A C++ compiler (Xcode CLI tools on macOS, Visual Studio Build Tools on Windows)

```bash
git clone https://github.com/Shironex/kirei-manga.git
cd kirei-manga
pnpm install
pnpm dev
```

<details>
<summary>All commands</summary>

```bash
pnpm dev                                      # Build shared, start web + electron
pnpm build:packages                           # Compile @kireimanga/shared
pnpm --filter @kireimanga/web build           # Build renderer bundle
pnpm --filter @kireimanga/desktop typecheck   # Typecheck main + backend
pnpm typecheck                                # Typecheck everything
pnpm build                                    # Full workspace build
pnpm test                                     # Run all test suites
pnpm lint                                     # eslint
pnpm format                                   # prettier --write
pnpm package:win                              # Package for Windows
pnpm package:mac                              # Package for macOS
pnpm version:patch                            # Bump patch version + tag
```

</details>

### Project structure

```
kirei-manga/
├── apps/
│   ├── desktop/          # Electron main + NestJS backend + protocols
│   │   ├── src/main/     # Electron bootstrap, window, updater, custom protocols
│   │   ├── src/modules/  # NestJS modules (mangadex, library, local, settings, database)
│   │   └── resources/    # Icons, mascot (production assets)
│   └── web/              # React + Vite renderer
│       ├── src/pages/    # Library, Browse, SeriesDetail, Reader, Settings
│       ├── src/components/  # Editorial UI primitives + splash + mascot
│       └── src/styles/   # globals.css with OKLCH design tokens
├── packages/
│   └── shared/           # Shared types, IPC channels, logger, constants
├── native/
│   └── bubble-detector/  # C++ NAPI addon (v0.3, scaffolded)
├── sidecar/
│   └── manga-ocr/        # Python OCR sidecar scaffold (v0.3)
├── scripts/              # Build, version bump, native build
├── docs/                 # PRD, per-milestone roadmaps, mascot prompts
└── assets/               # Icon, mascot, splashscreen preview
```

### Roadmap

Derived from the [PRD](docs/kireimanga-prd.md). All dates are approximate.

| Milestone | Scope | Status |
|---|---|---|
| **v0.1 — MangaDex Reader** | MangaDex API, chapter streaming, internal library, reader shell | ✅ shipped |
| **v0.2 — Local Library** | CBZ / folder import, unified library, local reader, metadata editor, MangaDex match, folder update polling | ✅ shipped |
| v0.3 — Translation | C++ bubble detection, `manga-ocr` sidecar, DeepL / Google / Ollama overlay | planned |
| v0.4 — AniList Sync | OAuth, read-progress sync, manga-list import | planned |
| v0.5+ — Polish | Kanji hover dictionary, Anki export, translation corrections, Linux build | backlog |

</details>

---

<a name="polski"></a>

<details>
<summary><h2>Polski</h2></summary>

### Czym jest KireiManga?

KireiManga to aplikacja desktopowa do czytania mangi, działająca lokalnie. Przegląda MangaDex przez oficjalne API, prowadzi osobistą bibliotekę w SQLite, i pozwala czytać pliki CBZ oraz foldery z obrazkami prosto z dysku obok mangi z MangaDex. W późniejszych etapach dojdzie nakładka OCR + tłumaczeń w czasie rzeczywistym dla surowych japońskich stron. Jest częścią **pakietu Shiro** obok [ShiroAni](https://github.com/Shironex/shiroani) (anime) i Shiranami (muzyka), dzieląc z nimi język projektowy i układ monorepo.

Redakcyjna estetyka tuszu i papieru. Paleta OKLCH sumi / kinari / bengara. Fraunces, Shippori Mincho, Geist. Bez paneli, bez neonu. Ciche miejsce do czytania.

### Zrzuty ekranu

<p align="center">
  <img src="assets/splashscreen.png" alt="Ekran powitalny" width="512" />
  <br />
  <em>Kirei czyta cichutko, gdy aplikacja się budzi</em>
</p>

> Więcej zrzutów po wydaniu wersji v0.2 — flow importu, strona serii, czytnik w akcji.

### Co znajdziesz w środku

|                               |                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------- |
| **Przeglądanie MangaDex**     | Szukaj po tytule, autorze, tagach, demografii lub ratingu przez oficjalne API MangaDex              |
| **Wewnętrzna biblioteka**     | Obserwuj / przestań obserwować, status czytania (czytane, ukończone, planowane, wstrzymane, porzucone) |
| **Import lokalny (v0.2)**     | Przeskanuj folder, zaimportuj serie CBZ / ZIP / katalog z obrazkami razem z MangaDex                |
| **Czytnik**                   | Tryb pełnoekranowy, single / double / webtoon, tryby dopasowania, nawigacja z klawiatury            |
| **Kierunek czytania**         | Ustawienie kierunku (RTL / LTR) per seria                                                           |
| **Śledzenie postępu**         | Wznawianie od ostatniej strony w każdym rozdziale — dla MangaDex i serii lokalnych                  |
| **Cache offline**             | Pobrane rozdziały serwowane z dysku, bez sieci                                                      |
| **Zakładki**                  | Zakładki na konkretnej stronie z opcjonalnymi notatkami                                             |
| **Odznaki nowych rozdziałów** | Automatyczne sprawdzanie aktualizacji + ręczne rescanowanie folderów lokalnych                      |
| **Nakładka tłumaczeń (v0.3)** | Detekcja dymków w C++ (OpenCV) + sidecar `manga-ocr` + DeepL / Google / Ollama bezpośrednio na stronie |
| **Synchronizacja AniList (v0.4)** | Logowanie OAuth, import listy, dwukierunkowa synchronizacja postępu                             |
| **Język**                     | Angielski i polski w standardzie                                                                    |

### Jak zacząć

Najnowszą wersję pobierzesz z [Releases](https://github.com/Shironex/kirei-manga/releases/latest).

#### Windows

1. Pobierz instalator `.exe`.
2. Uruchom — Windows może pokazać ostrzeżenie SmartScreen, bo aplikacja nie jest podpisana. Kliknij **"Więcej informacji"**, potem **"Uruchom mimo to"**.
3. Gotowe.

#### macOS

1. Pobierz plik `.dmg`.
2. Otwórz go i przeciągnij KireiManga do folderu Aplikacje.
3. macOS zablokuje aplikację, bo nie jest podpisana. Otwórz Terminal i wpisz:
   ```bash
   xattr -cr /Applications/KireiManga.app
   ```
4. Automatyczne aktualizacje na macOS nie działają jeszcze — nowe wersje pobieraj ręcznie z [Releases](https://github.com/Shironex/kirei-manga/releases).

### Budowanie ze źródeł

Potrzebujesz:

- [Node.js](https://nodejs.org/) >= 22
- [pnpm](https://pnpm.io/) >= 10
- Kompilatora C++ (Xcode CLI tools na macOS, Visual Studio Build Tools na Windows)

```bash
git clone https://github.com/Shironex/kirei-manga.git
cd kirei-manga
pnpm install
pnpm dev
```

### Plan rozwoju

Na podstawie [PRD](docs/kireimanga-prd.md).

| Kamień milowy | Zakres | Status |
|---|---|---|
| **v0.1 — Czytnik MangaDex** | API MangaDex, streaming rozdziałów, biblioteka, podstawy czytnika | ✅ wydane |
| **v0.2 — Biblioteka lokalna** | Import CBZ / folderów, zjednoczona biblioteka, edytor metadanych, dopasowanie do MangaDex, polling folderów | ✅ wydane |
| v0.3 — Tłumaczenia | Detekcja dymków (C++), sidecar `manga-ocr`, nakładka DeepL / Google / Ollama | planowane |
| v0.4 — Synchronizacja AniList | OAuth, synchronizacja postępu, import listy | planowane |
| v0.5+ — Dopracowanie | Słownik kanji pod kursorem, eksport Anki, poprawki tłumaczeń, build Linux | w zapasie |

</details>

---

## License

Source-available — see [LICENSE](LICENSE). Personal use and contributions via pull requests are permitted; redistribution and derivative works are not.

## Credits

KireiManga stands on the shoulders of the Shiro suite — design and architectural patterns are descended from [ShiroAni](https://github.com/Shironex/shiroani) and Shiranami. MangaDex provides the manga catalog through their generous official API.

<p align="right"><a href="#top">Back to top ↑</a></p>
