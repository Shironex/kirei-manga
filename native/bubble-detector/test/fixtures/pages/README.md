# Bubble-detector benchmark fixtures

Place manga page images here alongside human-labeled bounding-box JSON
files. The `pnpm bench-bubble-detector` script (Slice C.4) consumes this
folder.

This folder is intentionally empty in the repo — populating it is a
manual, copyright-sensitive task that lives outside the slice that built
the benchmark script. Add fixtures locally, or point the script at a
folder outside the repo via `--fixtures /path/to/private`.

## Layout

```
pages/
  vol01-p001.jpg
  vol01-p001.json
  vol01-p042.png
  vol01-p042.json
```

One image + one sibling `<basename>.json` per page. Sibling files
(rather than a single `labels.json`) keep diffs scoped to a single page
when fixtures are added or relabeled.

Supported image extensions: `.jpg`, `.jpeg`, `.png`, `.webp`.

## Label format

```json
{
  "boxes": [
    { "x": 120, "y": 240, "w": 380, "h": 220 },
    { "x": 800, "y": 1100, "w": 290, "h": 180 }
  ]
}
```

`x` / `y` / `w` / `h` are integer pixels in the original page coordinate
system. One labeled bounding box per actual speech bubble.

The benchmark uses an IoU threshold of `0.5` for a true-positive match
(the standard CV literature default). Override with `--iou`.

## Running the benchmark

```bash
pnpm bench-bubble-detector
pnpm bench-bubble-detector --fixtures native/bubble-detector/test/fixtures/pages
pnpm bench-bubble-detector --verbose
pnpm bench-bubble-detector --json     # CI-friendly structured output
```

The script requires a built native addon. If the addon is missing it
prints an actionable message and exits 1 — run `pnpm fetch-prebuilds` to
pull a CI prebuild, or build OpenCV locally per the
[`bubble-detector` README](../../../README.md).

## JSON output schema

```jsonc
{
  "fixtures": "native/bubble-detector/test/fixtures/pages",
  "iou_threshold": 0.5,
  "direction": "rtl",
  "pages": [
    {
      "image": "vol01-p042.jpg",
      "detected": 12,
      "labeled": 14,
      "matched": 11,
      "tp": 11,
      "fp": 1,
      "fn": 3,
      "precision": 0.92,
      "recall": 0.79,
      "mean_iou": 0.78,
      "duration_ms": 87.3,
    },
  ],
  "aggregate": {
    "pages": 1,
    "tp": 11,
    "fp": 1,
    "fn": 3,
    "precision": 0.92,
    "recall": 0.79,
    "mean_iou": 0.78,
    "duration_ms": { "mean": 87.3, "p50": 87.3, "p95": 87.3, "max": 87.3 },
  },
  "targets": { "recall": 0.9, "precision": 0.95 },
}
```

Aggregate precision/recall are micro-averaged across pages: total true
positives over total predictions / total ground-truth boxes.

## Copyright

Don't commit copyrighted manga pages here. Either:

- Use public-domain or CC-licensed manga (e.g. classic series with
  expired copyright).
- Use synthesized test pages (the C++ unit tests in
  `../../detector_test.cpp` do this with `cv::ellipse`).
- Keep your private fixtures in a folder outside the repo and pass
  `--fixtures /path/to/private`.
