# Tesseract Traineddata (Slice K.1)

`tesseract.js` looks here for the Japanese language models used as the OCR
fallback when the manga-ocr Python sidecar (Slice D) is unavailable
(download not completed, crashed, or user opted out).

## Files

| File                   | Size (approx) | Purpose                        |
| ---------------------- | ------------- | ------------------------------ |
| `jpn.traineddata`      | 2.4 MB        | Horizontal Japanese (yokogaki) |
| `jpn_vert.traineddata` | 2.9 MB        | Vertical Japanese (tategaki)   |

Total bundled overhead: ~5.5 MB. Much smaller than the ~450 MB sidecar
(Slice D), so worth the disk cost for a zero-config offline fallback.

## Source

[`tesseract-ocr/tessdata_fast`](https://github.com/tesseract-ocr/tessdata_fast)
on GitHub, raw URLs:

- https://github.com/tesseract-ocr/tessdata_fast/raw/main/jpn.traineddata
- https://github.com/tesseract-ocr/tessdata_fast/raw/main/jpn_vert.traineddata

## Why `_fast` and not `_best` or `tessdata`?

Three Tesseract data flavours exist upstream:

- `tessdata` — legacy, larger (~13 MB jpn), highest accuracy on traditional
  documents.
- `tessdata_best` — best modern LSTM accuracy, ~50 MB.
- `tessdata_fast` — smaller, ~2× faster, slight accuracy trade-off.

KireiManga's Tesseract path is the **fallback** when manga-ocr is down. It
runs on stylized speech-bubble text where even `tessdata_best` is far
behind manga-ocr — accuracy ceiling is set by the model architecture, not
the size of the weights. The `fast` variant gets us "good-enough offline,
fast on low-end laptops" which is the right trade-off for a fallback.

## License

Apache License 2.0 — see https://github.com/tesseract-ocr/tessdata_fast/blob/main/LICENSE.
Bundling and redistribution permitted with attribution. KireiManga's
third-party notices in `resources/licenses/` carry the upstream notice.

## How to update

These files are **not committed** — they are .gitignored under
`apps/desktop/resources/tesseract/*.traineddata`. CI fetches them at build
time via `pnpm fetch-tesseract`; local contributors do the same:

```bash
pnpm fetch-tesseract            # download missing only (idempotent)
pnpm fetch-tesseract --force    # re-download even if present
```

If upstream replaces a file, the script will refuse the new download
because `expectedBytes` no longer matches. To accept the upstream change:

1. Delete the local `*.traineddata` files.
2. Run `curl -sIL <url>` against each upstream URL to read the new
   `Content-Length`.
3. Update `expectedBytes` in `scripts/fetch-tesseract-traineddata.mjs`
   to the new sizes.
4. Re-run `pnpm fetch-tesseract` to fetch the new blobs.
5. Smoke-test the OCR fallback path before committing the script bump.
