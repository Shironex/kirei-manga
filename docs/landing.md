# Landing site

How kireimanga.app is built, what the 3D tour expects from its models, which checks guard it, and how it is deployed. The site lives in `apps/landing` (Astro, with one React Three Fiber island); the container is `Dockerfile.landing` at the repo root.

## Commands

```sh
pnpm dev:landing                                   # dev server on :3000
pnpm build:landing                                 # static build into apps/landing/dist
pnpm --filter @kireimanga/landing check            # astro check (types)
pnpm --filter @kireimanga/landing check:budget     # page weight budget, after a build
pnpm --filter @kireimanga/landing check:page       # axe AA, layout, no-JS, reduced motion, after a build
pnpm posters:landing                               # recapture the posters and og.png, after a build
```

`check:page` and `posters` need Chromium for Playwright once: `pnpm --filter @kireimanga/landing exec playwright install chromium`.

## How the page works

The home page is one sticky full-viewport stage behind scrolling stop sections: the hero, then one stop per feature (reader, theme, archives, library). Each stop has a camera frame. Below the tour come the feature grid, the screenshots, downloads, credits and the footer.

- **Posters first.** Every visitor gets a WebP poster per stop (`public/3d/posters/stop-<n>-1920.webp` and `-960.webp`, plus `hero-mobile.webp` for phones). The page is complete with JavaScript off: posters, copy and download links are plain HTML.
- **The 3D island is opt-in.** `src/tour/gate.ts` loads the scene only on a desktop-sized fine pointer (`(min-width: 1024px) and (pointer: fine)`), without reduced motion or Save-Data, with enough memory and cores, and when a WebGL2 context opens without a major performance caveat. Everything else stays on the posters. `?poster` forces the posters.
- **Lazy.** The island chunk (`src/scene/mount.tsx`) is imported after load, on the visitor's first move (pointer, wheel, scroll, key or touch) or after 5 s of calm, so it never competes with the first view. The poster shows the same frame until the scene is ready. Models and decoders load only with it.
- **Runtime limits.** DPR is capped to 1.5 and adapts to frame time; the loop stops when the stage is offscreen or the tab is hidden; spot light shadows render once; a lost context or a failed model falls back to the posters. Loaded models, textures and the environment map are disposed on unmount.
- **Seed colour.** Each stop sets `--seed-h` and `--seed-c` from one of the fictional covers, which tints the rim light and the page accents.

## 3D contract

Files under `apps/landing/public/3d/`, all web ready: KTX2 (etc1s) textures, meshopt geometry, real size in metres, origin at the bottom centre, front towards +Z.

| File | Loaded | Purpose |
| --- | --- | --- |
| `props/desk.glb` | island only | The desk, 1.10 m by 0.56 m. Lifted so its top sits at `DESK_TOP` (0.75 m). |
| `props/volume_open.glb`, `tea.glb`, `lamp.glb`, `shelf.glb`, `tablet.glb`, `bookend.glb`, `volume_stack.glb` | island only | One file per prop, placed at its anchor in `src/scene/props.ts` (position on the desk top and a turn about Y). |
| `mascot.glb` | island only | Kirei, 18 cm tall. Her front looks down +X, so the scene turns her to face the Library camera. Stands on `mascot_anchor` and plays her first animation if she has one. |
| `posters/*.webp` | always | The static stage for phones, reduced motion, no WebGL and the first paint. |
| `kirei-standin.webp` | island only, without `mascot.glb` | A flat cut-out of Kirei, used only while `mascot.glb` is missing. |
| `decoders/` | island only | Draco and Basis (KTX2) transcoders, copied from `three` at `dev` and `build` time by `scripts/copy-decoders.mjs`. Gitignored. Served locally, no CDN. |

Which files exist is read at build time (`astro.config.mjs`), so a missing file never costs a request. Every prop starts as a procedural blockout (`src/scene/Desk.tsx`) and is swapped for its file once it loads; a prop whose file is missing or fails keeps its blockout, alone. The scene goes live once every prop has loaded or failed.

Named parts the scene dresses:

- `tablet.glb`: the mesh with material `screen` (UVs 0 to 1) shows a painted manga page.
- `volume_stack.glb`: materials `cover_1` to `cover_3` (UVs 0 to 1 per face) wear the painted covers of the fictional series, bottom to top Stardust Relay, Akane Signal and The Moonlit Bookshop; `pages` becomes cream paper. Kirei stands on the top of the stack, measured from the file.
- `desk.glb`: its grey is pushed towards black with an even soft gloss (its compressed normal and roughness maps show blocks in a glossy highlight, so they are dropped).
- `lamp.glb`: a warm glow and the spot light sit under the shade (`LAMP_BULB` in `src/scene/props.ts`), aimed at the open volume.

Anchors the scene places on the props (`src/scene/anchors.ts`): `mascot_anchor` (top of the stack), `lamp_light` (the bulb) and `lamp_target` (the open volume). The camera stops and the ribbon's course are in `src/tour/stops.ts`, in the same desk coordinates as the prop anchors.

The glowing page ribbon is not a file. It is built in code (`src/scene/Ribbon.tsx`) along a centripetal Catmull-Rom curve through the ribbon points, from the open volume past every prop to Kirei's feet, and the camera rig follows the same curve between stops.

After changing a model, a prop anchor or a stop frame, rebuild and run `pnpm posters:landing` so the posters and `og.png` match the live scene. Commit the regenerated files.

## Budgets and checks

`scripts/check-budget.mjs` reads `dist` and fails above these limits. Whatever the serve container compresses (text, wasm and the GLBs) is counted gzipped:

| Measure | Limit |
| --- | --- |
| First view JS | 15 kB |
| First view total (HTML, CSS, eager JS, preloads, eager images) | 450 kB |
| 3D island JS | 400 kB |
| 3D island assets (the prop files, the mascot and the Basis transcoder) | 2400 kB |

`scripts/check-page.mjs` runs axe (WCAG 2.1 A and AA) at 1440, 390 and 320 px wide, checks for sideways scroll and the 16px phone gutter, loads the page with JavaScript off, and checks that reduced motion keeps the posters.

Both run in the `landing` job of `.github/workflows/ci.yml`.

## Display font

The headings and the brand name use a cut-down Bricolage Grotesque, `apps/landing/src/assets/fonts/bricolage-display.woff2` (65.0 kB, down from 131.5 kB), declared in `apps/landing/src/styles/display-font.css`. It keeps weight 600 to 700, width 75% to 90% and the full optical size axis, and only Basic Latin plus curly quotes and the ellipsis. If display copy (any `h1`, `h2` or `h3`, the tour headings, or the brand name) needs another character, widen `--unicodes`, match `unicode-range` in `display-font.css`, and rerun. The same goes for a heading weight or width outside those ranges.

Made with fonttools 4.68.0 in a throwaway venv, from the repo root, after `pnpm install`:

```sh
python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools==4.68.0 brotli
SRC=apps/landing/node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-standard-normal.woff2
/tmp/ft/bin/fonttools varLib.instancer "$SRC" wght=600:700 wdth=75:90 -o /tmp/bricolage-limited.ttf
/tmp/ft/bin/pyftsubset /tmp/bricolage-limited.ttf \
  --unicodes=20-7E,A0,2018-2019,201C-201D,2026 \
  --flavor=woff2 --no-hinting --desubroutinize \
  --output-file=apps/landing/src/assets/fonts/bricolage-display.woff2
```

On Windows the venv tools live in `ft\Scripts\` instead of `ft/bin/`; run the same commands from Git Bash with paths adjusted.

## Deploy (Coolify)

The site is a Coolify application, uuid `q94eolyvc98izz59js4vskzy`, built from `Dockerfile.landing`: a pnpm build stage, then `serve` on port 3000 as a non-root user (uid 10001). It is a static site, so there are no runtime env vars.

Current state: the application is in maintenance mode and serves a coming-soon page. It does not build from this branch yet.

At the 1.0 master swap (when `rewrite/tauri` becomes `master`):

1. Point the application at `master` with `Dockerfile.landing` as the Dockerfile and the repo root as the build context.
2. Set its watch paths to `apps/landing/**` so only landing changes redeploy it. Add `Dockerfile.landing` too if the Dockerfile should trigger a deploy on its own.
3. Turn maintenance mode off and deploy once by hand; check `/`, `/404`, `/og.png`, `/3d/mascot.glb` and `/3d/props/desk.glb` answer.

`Dockerfile.landing` pins pnpm through corepack and must match `packageManager` in the root `package.json` (10.34.9 at the time of writing). Bump both together.

The download buttons link to `releases/latest` on GitHub. Until 1.0 is published that is still the legacy v0.2.0 release.

## Screenshots

The screenshots section shows real captures of the app from `assets/screenshots/`, made by `pnpm shots` (see `docs/screenshots.md`). `Dockerfile.landing` copies that folder into the build stage.
