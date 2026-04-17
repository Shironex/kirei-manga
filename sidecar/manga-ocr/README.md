# manga-ocr sidecar

Python sidecar that runs the [`manga-ocr`](https://github.com/kha-white/manga-ocr)
ML model for Japanese OCR on speech bubbles. The desktop spawns this as a
long-lived child process on the first translation request, then talks to it
over stdin/stdout.

## JSON contract

Requests are newline-delimited JSON on stdin; responses are newline-delimited
JSON on stdout. The desktop side correlates request to response by the `id`
field. Anything written to stderr is ignored by the JSON channel and is safe
for diagnostics.

On startup, before the first request, the sidecar emits one notification:

```json
{"id": null, "ready": true}
```

### `op: ocr`

Crop each box out of `image_path`, run `manga-ocr` on the crop, return the
recognized text per box. The model loads lazily on the first call (~6s).

```json
{"op": "ocr", "id": "req-1", "image_path": "C:/.../page-04.png",
 "boxes": [{"x": 120, "y": 88, "w": 240, "h": 180}]}
```

```json
{"id": "req-1", "results": [{"box_index": 0, "text": "おはよう"}]}
```

A per-box failure (bad crop, OCR error) returns an entry with empty text and
an `error` string instead of failing the whole request:

```json
{"id": "req-1", "results": [
  {"box_index": 0, "text": "おはよう"},
  {"box_index": 1, "text": "", "error": "OSError: cannot identify image file"}
]}
```

A request-level failure (missing image, bad payload) returns one envelope:

```json
{"id": "req-1", "error": "image not found: ..."}
```

### `op: ping`

Cheap healthcheck. Does not load the model.

```json
{"op": "ping", "id": "hc-1"}
```

```json
{"id": "hc-1", "ok": true, "model_loaded": false}
```

### `op: shutdown`

Acknowledges, then exits 0. SIGTERM (and SIGINT, where available) does the
same.

```json
{"op": "shutdown"}
```

```json
{"id": null, "ok": true, "shutting_down": true}
```

### Top-level errors

Unparseable JSON or unknown ops produce an error envelope on the same line —
the loop never dies on a bad request.

```json
{"id": null, "error": "invalid JSON: Expecting value: line 1 column 1 (char 0)"}
```

## Local development

```bash
# POSIX
python -m venv .venv && source .venv/bin/activate
# Windows
python -m venv .venv && .venv\Scripts\activate

pip install -r requirements.txt
python main.py
```

`main.py` reads stdin, so paste a JSON line and press Enter to drive it
interactively. Use Ctrl+D (POSIX) or Ctrl+Z then Enter (Windows) — or send
`{"op": "shutdown"}` — to exit.

## Building the bundle

PyInstaller bundle script — lands in Slice D.2. The bundled binary will be
copied to `resources/sidecar/{platform}/kirei-ocr(.exe)?` and shipped inside
the desktop installer.

## Bundle size

The PyInstaller output is ~450MB (torch + transformers + the manga-ocr
weights dominate). Per the v0.3 roadmap open question, the current plan is
to download the bundle on first use rather than baking it into the main
installer — keeps the initial download under 200MB.
