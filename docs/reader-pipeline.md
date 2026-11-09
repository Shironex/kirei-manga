# Reader page pipeline

How pages get from an archive to the webview, and the contract the reader UI (#29) and the quality settings (#30) build on.

## Flow

1. `open_source(path)` opens a CBZ, CBR or folder (`kirei-archive`) and returns a source id plus every page's name, format, header size and byte length.
2. The UI tells the backend where it is with `focus_page(id, index, direction)` and how big pages are shown with `set_viewport(maxWidth, maxHeight)`.
3. Read-ahead workers (`kirei-reader`) render the current page, `ahead` pages in the reading direction and `behind` pages the other way into a byte-bounded LRU.
4. The webview loads `pageUrl(id, index, revision)`. The `kirei-page` protocol answers from the cache, waits for a worker already rendering that page, or renders it on the request thread.

## Rendering

A page is served as stored when it fits the viewport box (or is within 10 percent of it), when no box is set, or when it is GIF (animation), AVIF or JPEG XL (passed to the webview's own decoder). Otherwise it is decoded (`image`), downscaled to fit the box with its aspect kept (`fast_image_resize`, Lanczos3 by default) and re-encoded: JPEG quality 90 (`jpeg-encoder`) for opaque pages (grayscale stays one channel), PNG for pages with transparency. With sharpening on, every decodable page is decoded, unsharp masked after the resize (if any) and re-encoded the same way, even when it already fits. A page that cannot be decoded is served as stored and counted in `decodeFallbacks`.

### Tall strips

A page at least `TALL_RATIO` (2) times taller than wide is a tall strip (`is_tall`). With `split_tall` on and a box bounded on both sides (screen fit in the paged modes), a strip is fitted to the box width only and keeps its full height, so the reader can show it one screen at a time (see Tall strips in the paged modes in [reader.md](reader.md)) instead of shrinking it into the box. A strip already narrower than the box is served as stored, never upscaled. A box with no width (height fit) still bounds the strip by its height, and webtoon and width fit have no height bound anyway. A strip taller than 65535 pixels at the box width is past what the JPEG encoder takes and is served as stored, like any page past the decode caps. `served_size` reports the same size, so `page_meta` agrees with what is rendered.

The cache holds these rendered bytes, not decoded pixels. A decoded 1800x2700 page is 4.9 MB in grayscale and 19 MB in RGBA and the webview needs encoded bytes anyway, so caching pixels costs several times the memory and still needs an encode per request. A hit is a copy of a few hundred KB.

## Render revision

Render settings (viewport box, resampling filter, sharpening, tall strip split) carry a revision number. Every real change bumps it, drops cached pages of older revisions and every queued job, and re-queues the last focus so the window fills again at the new size. Setting the same box again keeps the revision and the cache, so resize handlers can call `set_viewport` freely.

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
| `set_render_quality` | `resample: 'lanczos3' \| 'mitchell' \| 'nearest', sharpen` (0 to 100, 0 is off), `splitTall` | `{ revision }` |
| `page_meta` | `id` | `{ revision, pages: PageMeta[] }`: `PageInfo` plus `servedWidth`, `servedHeight` from headers, no decode |
| `close_source` | `id` | nothing |
| `reader_stats` | none | counters, `serve` and `render` latency (`count, p50Us, p95Us, maxUs` over the last 512 samples), cache use, revision |

Typed wrappers live in `apps/desktop/src/lib/reader.ts`, with `deviceBox(cssWidth, cssHeight, devicePixelRatio)` to turn a CSS box into a viewport hint.

## For the reader modes (#29)

- Paged and double page: send the box one page occupies (half the width for a spread). Webtoon fitted to width: send only `maxWidth`. Zooming past fit: send a larger box or `null` for both sides to get originals.
- Use `page_meta` sizes for spread detection, webtoon detection, tall strip splits and placeholders before pages load.
- A chapter opened ahead of time (the next one, near the end of the current) holds its own source id; its pages load through the same protocol with the current revision, so a webtoon can show them under the last strip before the reader moves on.
- Call `focus_page` on every page change, with the direction the reader moved.

## Quality settings

`RenderSettings` carries `resample` (`Lanczos3`, `Mitchell`, `Nearest`) and `sharpen` (an unsharp mask with a separable [1 2 1] blur, amount up to 1.5 at 100, alpha left alone), set with `set_render_quality` together with `split_tall` (see Tall strips above). Only these two run in Rust: the browser has no choice of resize filter, and an unsharp mask is a neighbourhood operation CSS cannot express without an SVG filter repainted on every frame. Tone and colour (brightness, contrast, saturation, warmth, grayscale, invert) are CSS filters in the reader, see [reader.md](reader.md).

## Measuring

`cargo test -p kirei-reader --release --test bench -- --ignored --nocapture original_size` (and `viewport_size`, one per process) builds a 3000 page CBZ of 1800x2700 JPEG scans and reports open time, page turn p50/p95 while reading and while scrubbing, bytes served and peak RSS.
