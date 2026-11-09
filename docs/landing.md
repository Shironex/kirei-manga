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

Files under `apps/landing/public/3d/`:

| File | Loaded | Purpose |
| --- | --- | --- |
| `scene.glb` | optional, island only | The desk set. When missing, the procedural blockout in `src/scene/Desk.tsx` stands in. |
| `mascot.glb` | optional, island only | Kirei, 12 cm tall, base at the origin, KTX2 (etc1s) textures, meshopt geometry. Placed on `mascot_anchor` and plays its first animation. When missing, a flat stand-in sprite (`kirei-standin.webp`) is used. |
| `posters/*.webp` | always | The static stage for phones, reduced motion, no WebGL and the first paint. |
| `decoders/` | island only | Draco, Basis (KTX2) transcoders, copied from `three` at `dev` and `build` time by `scripts/copy-decoders.mjs`. Gitignored. Served locally, no CDN. |

Named nodes `scene.glb` may carry (all optional, read by `src/scene/anchors.ts`; missing ones fall back to the defaults in `src/tour/stops.ts`):

- `stop_<id>_cam` and `stop_<id>_look` for each stop id (`hero`, `reader`, `theme`, `archives`, `library`): camera position and look target.
- `ribbon_00`, `ribbon_01`, ...: control points of the page ribbon, in order. Four or more replace the default path.
- `mascot_anchor`: where Kirei stands (on the volume stack).
- `lamp_light` and `lamp_target`: the desk lamp's spot light.
- `prop_<name>`: groups for the props (`volume_open`, `tea`, `lamp`, `shelf`, `tablet`, `bookend`, `volume_stack`).

The glowing page ribbon is not in `scene.glb`. It is built in code (`src/scene/Ribbon.tsx`) along a centripetal Catmull-Rom curve through the ribbon points, and the camera rig follows the same curve between stops.

After changing a model or a stop frame, rebuild and run `pnpm posters:landing` so the posters and `og.png` match the live scene. Commit the regenerated files.

## Budgets and checks

`scripts/check-budget.mjs` reads `dist` and fails above these limits (text is counted gzipped):

| Measure | Limit |
| --- | --- |
| First view JS | 15 kB |
| First view total (HTML, CSS, eager JS, preloads, eager images) | 450 kB |
| 3D island JS | 400 kB |
| 3D island assets (models and the Basis transcoder) | 1600 kB |

`scripts/check-page.mjs` runs axe (WCAG 2.1 A and AA) at 1440, 390 and 320 px wide, checks for sideways scroll and the 16px phone gutter, loads the page with JavaScript off, and checks that reduced motion keeps the posters.

Both run in the `landing` job of `.github/workflows/ci.yml`.

## Deploy (Coolify)

The site is a Coolify application, uuid `q94eolyvc98izz59js4vskzy`, built from `Dockerfile.landing`: a pnpm build stage, then `serve` on port 3000 as a non-root user (uid 10001). It is a static site, so there are no runtime env vars.

Current state: the application is in maintenance mode and serves a coming-soon page. It does not build from this branch yet.

At the 1.0 master swap (when `rewrite/tauri` becomes `master`):

1. Point the application at `master` with `Dockerfile.landing` as the Dockerfile and the repo root as the build context.
2. Set its watch paths to `apps/landing/**` so only landing changes redeploy it. Add `Dockerfile.landing` too if the Dockerfile should trigger a deploy on its own.
3. Turn maintenance mode off and deploy once by hand; check `/`, `/404`, `/og.png` and `/3d/mascot.glb` answer.

`Dockerfile.landing` pins pnpm through corepack and must match `packageManager` in the root `package.json` (10.34.9 at the time of writing). Bump both together.

The download buttons link to `releases/latest` on GitHub. Until 1.0 is published that is still the legacy v0.2.0 release.

## Placeholders

- The desk props are a procedural blockout until a modelled `scene.glb` lands.
- The screenshots section uses the approved prototype captures from `docs/design/screenshots`; real captures of the finished app replace them with the release.
