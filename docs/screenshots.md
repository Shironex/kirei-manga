# Screenshots

The app screenshots in the README and on the landing are captures of the real React frontend, made by one command:

```sh
pnpm shots                                              # every shot into assets/screenshots/
pnpm shots library reader-single                        # only the named shots
pnpm --filter @kireimanga/desktop exec playwright install chromium   # once, for Playwright
```

Commit the regenerated files. The landing imports them from `assets/screenshots/` (Astro makes the AVIF and WebP sizes at build time), and the README links them directly.

## How it works

`apps/desktop/scripts/shots.mjs` builds `apps/desktop/shots.html` into `apps/desktop/dist-shots` (gitignored, deleted afterwards), serves it with `vite preview` and opens each view in headless Chromium. It only saves what its own headless browser renders; it never captures the screen or a native window.

`shots.html` loads `src/shots/main.ts`, the demo capture mode:

- `src/shots/ipc.ts` replaces the Rust core with Tauri's `mockIPC`: every command the screens call answers from the demo catalogue, events go through the mock event bus, and `convertFileSrc` hands out the images drawn for the demo. A command it does not know is logged with the `[shots] unhandled command` prefix and fails the run, so a new command shows up as a red run, never as a half empty screenshot.
- `src/shots/data.ts` is the demo library: series, chapters, collections, tags, smart filters, MangaDex titles and a year of reading stats. Every time is an offset from a fixed `NOW` (2026-11-07 19:30 UTC).
- `src/shots/art.ts` draws the covers, manga pages and webtoon strips from a seed: shapes as SVG, lettering on a canvas with the app's own fonts.

Determinism: the capture pins the page clock to `NOW`, seeds `Math.random`, fixes the viewport (1440 by 900 at DPR 2), locale (`en-US`), time zone (UTC), user agent (macOS Chrome), dark colour scheme and reduced motion, blocks every request off the local server, waits for fonts and images, and screenshots with animations disabled. Two runs give byte identical files.

## Inert in release builds

Nothing in `src/shots` is imported by the app. The release build (`pnpm build`) has `index.html` as its only input, so the demo entry, the mock core and the demo data never reach a shipped bundle. To check: `pnpm build`, then `grep -rlE "Moonlit Bookshop|\[shots\]|mockIPC" apps/desktop/dist` finds nothing.

For a look by hand, `pnpm dev:web` and open `http://localhost:15180/shots.html`.

## Shots

| File | View |
| --- | --- |
| `library.webp` | Library home: continue hero, Want to Read, pinned smart filters |
| `series.webp` | Series page with tags, a collection and AniList progress |
| `reader-single.webp` | Reader, single page, right to left |
| `reader-webtoon.webp` | Reader, webtoon strip |
| `settings.webp` | Settings, Appearance and Reader |
| `browse.webp` | Browse MangaDex |
| `online-series.webp` | A MangaDex series page |
| `command-palette.webp` | Command palette over the library |
| `stats.webp` | Reading stats |

A new shot is one entry in `SHOTS` in `shots.mjs`: a route, a selector that exists once the view has its data, and an optional action before the capture.

## Licence of the demo content

Everything shown is made for this project: the titles, authors, scanlation groups, descriptions and lines of dialogue are invented, and the covers, pages and strips are drawn by `art.ts` (its motifs follow the fictional covers of the design prototype in `docs/design/prototype.html`). No manga page, MangaDex cover or other third party artwork is included. The only outside material is the app's own bundled fonts (SIL OFL 1.1, licences in `apps/desktop/src/assets/fonts`) and the Kirei mascot from the app.
