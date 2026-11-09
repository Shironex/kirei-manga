# Reader screen

The full-window reader on top of the page pipeline in [reader-pipeline.md](reader-pipeline.md). Code lives in `apps/desktop/src/features/reader/`.

## Opening a chapter

`useOpenChapter()` from `features/reader/openChapter.ts` is the one way in:

```ts
const openChapter = useOpenChapter();
openChapter({ kind: 'library', seriesId, chapterId }); // resumes from saved progress
openChapter({ kind: 'file', path }); // any CBZ, CBR or folder
openChapter({ kind: 'library', seriesId, chapterId, page: 0 }); // explicit start page
```

It navigates to `/read/$seriesId/$chapterId` or `/read/file?path=`. A library chapter records progress through `library_record_progress` (the furthest page on screen, so a spread ending on the last page completes the chapter) and keeps its reader choices in the series settings under `reader`. The `reader.*` app settings (see [settings.md](settings.md)) are the defaults for a series with nothing saved; a file starts from them and keeps changes for the session.

## Modes

| Mode    | Layout                                                                                                     |
| ------- | ---------------------------------------------------------------------------------------------------------- |
| Single  | One page. Fit: screen (whole page), width (up to 960 px), height, or original (one image pixel per device pixel); the last three scroll when larger than the stage. |
| Double  | Spreads. A page at least as wide as it is tall is a spread scan and shows alone; the rest pair up.         |
| Webtoon | A continuous column, 720 px at zoom 1. Only pages near the screen are in the DOM.                          |

Double page options: wide pages alone (`reader.detectSpreads`), the cover alone (on by default) and the one page shift (S), which moves the pairing for books whose spreads come out split. The shift is the per series page offset: like every layout choice it is saved in the series settings under `reader`, so every chapter of that series opens with it. Spread detection uses the header sizes from `page_meta`, so it needs no decode. The layout rules are pure functions in `model/` with unit tests (`spreads.ts`, `screens.ts`, `fit.ts`, `webtoon.ts`, `split.ts`).

### Webtoon detection

A page at least twice as tall as wide is a tall strip (`TALL_RATIO` in `model/split.ts`, the same ratio as `kirei_reader::TALL_RATIO`). When at least half of a chapter's pages with a known size are tall strips (`looksLikeWebtoon` in `model/webtoon.ts`), the chapter opens in webtoon mode, unless the series has a mode of its own. The decision uses the header sizes `page_meta` already returned, so it costs nothing at open. Picking a mode inside the reader saves it with `modeChosen: true` in the series' `reader` entry, and from then on that mode wins over detection. An entry saved before detection existed counts as a choice only when its mode differs from `reader.mode`. `reader.detectWebtoon` turns detection off.

### Tall strips in the paged modes

With `reader.splitTall` on (the default), single and double page modes at screen fit show a tall strip one screen at a time instead of shrinking it into the window. The pipeline renders the strip to the box width only (see [reader-pipeline.md](reader-pipeline.md)), the reader shows it at the stage width up to 960 px, and each part fills the stage height, overlapping the one before by 5 percent; the last part ends flush with the strip's bottom (`sliceStrip`). Turning the page walks the parts top to bottom before the next page, and going back onto a split strip starts at its last part (`stepParts` in `model/screens.ts`). In double page mode a tall strip always shows alone. Other fits scroll a tall page already, so they are left alone.

Right to left mirrors the spread, the tap zones, the arrows and the scrubber. A series starts in the direction its ComicInfo `<Manga>` field gives (`YesAndRightToLeft` is right to left, `No` is left to right).

Webtoon reports the page a third of the way down the screen to `focus_page`, so read-ahead follows the scroll. Scrolling on past the end, or Space on the end card, opens the next chapter.

### Moving to the next chapter

Once a webtoon chapter is half read, or a paged one is four pages from its end, the reader opens the next chapter ahead (`useNextChapter`, `prefetchChapter` in `useChapter.ts`): its source and `page_meta`, nothing rendered. Moving on then shows the next chapter in the first frame, with no loading screen. A prefetched chapter stays open while either reader holds it and closes a tick after the last one lets go, so the handover survives the old reader unmounting before the new one mounts.

In webtoon mode, when the next chapter would open in webtoon too, its first six pages are laid under the last strip with no gap, in place of the end card, and the first two are fetched into the webview's cache at 80 percent of the chapter. Reading simply scrolls on. When the last strip leaves the top of the screen, the next chapter takes over (`handOver`) at the same page and share of it, with the same column zoom and the render revision in effect, so its reader lays out the same pixels in the same place and shows them at once. The handover also carries the series settings as last written, since the save of a recent change may still be waiting. Progress is measured through the chapter alone, so it completes when its last strip reaches the bottom of the screen.

## Rendering hints

The stage sits between the two glass bars and keeps its size when they fade, so a hidden toolbar never triggers new renders. The reader sends `set_viewport` with the box a page occupies: the stage on screen fit, `maxWidth` only on width fit and in webtoon, `maxHeight` only on height fit and no box for original, scaled by the zoom once it settles. Page URLs carry the revision; a page whose URL changes is decoded off screen and swapped in, so it never blanks. The next two screens are preloaded into the webview's image cache.

## Image adjustments

The adjust panel (A) has brightness, contrast, saturation, sharpen and warmth sliders, invert for night reading, grayscale and the resampling filter, above the layout settings.

| Adjustment | Where it runs |
| --- | --- |
| Brightness, contrast, saturation, warmth (sepia), grayscale, invert | CSS `filter` on the page images (`model/adjust.ts`, `cssFilter`) |
| Sharpen, resampling (Lanczos3, Mitchell, Nearest) | The pipeline, through `set_render_quality` |

Tone and colour are CSS filters because each is an exact linear map on the colour (the Filter Effects spec), runs on the GPU, follows a slider live and needs no new render, and it also reaches the pages the pipeline passes through untouched (GIF, AVIF, JPEG XL). Sharpen and resampling run in Rust because the browser has no choice of resize filter and an unsharp mask is a neighbourhood operation CSS cannot express without an SVG filter repainted every frame. Sharpen re-renders the window of pages once the slider settles (250 ms); Nearest also sets `image-rendering: pixelated` so the webview's own scaling stays crisp. Invert is followed by `hue-rotate(180deg)` so colours keep their hue, and it comes first in the chain so brightness dims what is on screen.

A library series saves its adjustments in the series settings under `adjust` while "Remember for this series" is on (the default); turning it off stores `null` and the next chapter opens neutral. The default filter comes from `reader.filter`. A file keeps adjustments for the session. Reset returns the adjustments (not the layout) to the defaults.

## Input

These are the built-in keys; every one can be changed in Settings, Shortcuts (see [settings.md](settings.md), `reader.keys`). The tooltips in the reader show the keys in effect.

| Key                       | Action                                       |
| ------------------------- | -------------------------------------------- |
| Arrows, Space, Page Up/Down | Turn the page (arrows follow the direction; webtoon scrolls) |
| Home, End                 | First or last page                           |
| 1, 2, 3                   | Single, double, webtoon                      |
| D                         | Reading direction                            |
| S                         | Shift spreads by one page                    |
| +, -, 0                   | Zoom in, out, back to fit                    |
| F                         | Fullscreen                                   |
| H                         | Hide or show the bars                        |
| A                         | The adjust panel                             |
| I                         | Engine numbers: last page turn, serve and render latency, cache |
| Esc                       | Close the panel, leave fullscreen, close the reader |

Shortcuts work while a panel slider has focus, except the keys that move it. A click on a bar button hands focus back to the stage, so Space reads on; Space and Enter press a button reached with Tab.

The outer thirds of the stage turn pages and the middle shows or hides the bars. The wheel turns pages unless the page scrolls (a fit larger than the stage) or is zoomed. Pinch or Ctrl and the wheel zoom around the pointer, a zoomed page pans by dragging, and a double click on the middle zooms in or back.
