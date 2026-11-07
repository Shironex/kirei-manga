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

Double page options: wide pages alone (`reader.detectSpreads`), the cover alone (on by default) and the one page shift (S), which moves the pairing for books whose spreads come out split. Spread detection uses the header sizes from `page_meta`, so it needs no decode. The layout rules are pure functions in `model/` with unit tests (`spreads.ts`, `screens.ts`, `fit.ts`, `webtoon.ts`).

Right to left mirrors the spread, the tap zones, the arrows and the scrubber. A series starts in the direction its ComicInfo `<Manga>` field gives (`YesAndRightToLeft` is right to left, `No` is left to right).

Webtoon reports the page a third of the way down the screen to `focus_page`, so read-ahead follows the scroll. Scrolling on past the end, or Space on the end card, opens the next chapter.

## Rendering hints

The stage sits between the two glass bars and keeps its size when they fade, so a hidden toolbar never triggers new renders. The reader sends `set_viewport` with the box a page occupies: the stage on screen fit, `maxWidth` only on width fit and in webtoon, `maxHeight` only on height fit and no box for original, scaled by the zoom once it settles. Page URLs carry the revision; a page whose URL changes is decoded off screen and swapped in, so it never blanks. The next two screens are preloaded into the webview's image cache.

## Input

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

The outer thirds of the stage turn pages and the middle shows or hides the bars. The wheel turns pages unless the page scrolls (a fit larger than the stage) or is zoomed. Pinch or Ctrl and the wheel zoom around the pointer, a zoomed page pans by dragging, and a double click on the middle zooms in or back.
