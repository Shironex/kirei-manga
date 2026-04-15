# manga-ocr sidecar

Python sidecar that runs the [`manga-ocr`](https://github.com/kha-white/manga-ocr)
ML model for Japanese OCR on speech bubbles.

## Status

v0.1 — placeholder. The PyInstaller build script, stdin/stdout JSON protocol,
and crash-restart supervisor land with milestone v0.3 (see PRD §10).

## Planned layout

- `main.py` — OCR server speaking JSON over stdin/stdout.
- `build.py` — PyInstaller bundle script producing a single binary shipped
  inside `resources/sidecar/` at package time.
