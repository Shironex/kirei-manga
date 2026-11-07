# Reader page pipeline

How pages get from an archive to the webview, and the contract the reader UI (#29) and the quality settings (#30) build on.

## Flow

1. `open_source(path)` opens a CBZ, CBR or folder (`kirei-archive`) and returns a source id plus every page's name, format, header size and byte length.
2. The UI tells the backend where it is with `focus_page(id, index, direction)` and how big pages are shown with `set_viewport(maxWidth, maxHeight)`.
3. Read-ahead workers (`kirei-reader`) render the current page, `ahead` pages in the reading direction and `behind` pages the other way into a byte-bounded LRU.
4. The webview loads `pageUrl(id, index, revision)`. The `kirei-page` protocol answers from the cache, waits for a worker already rendering that page, or renders it on the request thread.

## Rendering

A page is served as stored when it fits the viewport box (or is within 10 percent of it), when no box is set, or when it is GIF (animation), AVIF or JPEG XL (passed to the webview's own decoder). Otherwise it is decoded (`image`), downscaled to fit the box with its aspect kept (`fast_image_resize`, Lanczos3 by default) and re-encoded: JPEG quality 90 (`jpeg-encoder`) for opaque pages (grayscale stays one channel), PNG for pages with transparency. A page that cannot be decoded is served as stored and counted in `decodeFallbacks`.

The cache holds these rendered bytes, not decoded pixels. A decoded 1800x2700 page is 4.9 MB in grayscale and 19 MB in RGBA and the webview needs encoded bytes anyway, so caching pixels costs several times the memory and still needs an encode per request. A hit is a copy of a few hundred KB.

## Render revision

Render settings (viewport box, resampling filter) carry a revision number. Every real change bumps it, drops cached pages of older revisions and every queued job, and re-queues the last focus so the window fills again at the new size. Setting the same box again keeps the revision and the cache, so resize handlers can call `set_viewport` freely.

The revision is part of the cache key and of the page `ETag` (`"<id>-<index>-r<revision>"`). The protocol sends `Cache-Control: private, no-cache` and answers a matching `If-None-Match` with `304` without rendering. Append the revision to page URLs (`pageUrl(id, index, revision)` adds `?r=<revision>`): the protocol ignores the query, but a new URL is what makes the webview drop the old bitmap.

## Cancellation and the budget

- `focus_page` drops every queued job from the previous position before queueing the new window. A running render whose page is no longer in the window stops at its next checkpoint (after the read, after the decode). Flipping through hundreds of pages queues at most one window.
- A page requested while a worker renders it is not rendered twice: the request waits for that render (`joined`).
- The cache never holds more than its budget (256 MiB in the app). The read-ahead window is trimmed to three quarters of the budget, using stored sizes as an upper bound, so it cannot evict the page on screen. One decode is capped at 512 MiB and 20000 px per side; larger pages are served as stored.

## Tauri commands

| Command | Arguments | Returns |
|---|---|---|
| `open_source` | `path` | `{ id, kind, pages: PageInfo[], openMs }` |
| `focus_page` | `id, index, direction: 'forward' \| 'backward'` | nothing |
| `set_viewport` | `maxWidth, maxHeight` (device pixels, `null` for unbounded, 1 to 16384) | `{ revision }` |
| `page_meta` | `id` | `{ revision, pages: PageMeta[] }`: `PageInfo` plus `servedWidth`, `servedHeight` from headers, no decode |
| `close_source` | `id` | nothing |
| `reader_stats` | none | counters, `serve` and `render` latency (`count, p50Us, p95Us, maxUs` over the last 512 samples), cache use, revision |

Typed wrappers live in `apps/desktop/src/lib/reader.ts`, with `deviceBox(cssWidth, cssHeight, devicePixelRatio)` to turn a CSS box into a viewport hint.

## For the reader modes (#29)

- Paged and double page: send the box one page occupies (half the width for a spread). Webtoon fitted to width: send only `maxWidth`. Zooming past fit: send a larger box or `null` for both sides to get originals.
- Use `page_meta` sizes for spread detection and placeholders before pages load.
- Call `focus_page` on every page change, with the direction the reader moved.

## For quality settings (#30)

`RenderSettings` in `kirei-reader` already carries `resample` (`Lanczos3`, `Mitchell`, `Nearest`). Adjustments add fields there and a step in `render.rs` after the resize; the revision mechanism invalidates the cache with no further work. A command that sets them should go through `Reader::update_render_settings` like `set_viewport` does.

## Measuring

`cargo test -p kirei-reader --release --test bench -- --ignored --nocapture original_size` (and `viewport_size`, one per process) builds a 3000 page CBZ of 1800x2700 JPEG scans and reports open time, page turn p50/p95 while reading and while scrubbing, bytes served and peak RSS.
