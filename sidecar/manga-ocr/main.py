"""manga-ocr sidecar — JSON-over-stdio OCR server.

Reads newline-delimited JSON requests on stdin, writes responses on stdout.
Consumed by the desktop process manager in `apps/desktop/src/modules/translation/sidecar/`
(lands in Slice D.4).
"""

import json
import sys
import os
import signal
from pathlib import Path
from typing import Optional, Any


# Lazy-loaded manga-ocr model. Kept None until the first OCR request so the
# initial `op: ping` from the desktop healthcheck can answer in milliseconds
# rather than waiting ~6s for the transformer weights to load.
_model: Optional[Any] = None


def get_model():
    global _model
    if _model is None:
        from manga_ocr import MangaOcr  # heavy import: ~6s model load
        _model = MangaOcr()
    return _model


def crop_pil(image_path: str, box: dict[str, int]):
    from PIL import Image
    img = Image.open(image_path)
    left = box["x"]
    upper = box["y"]
    right = left + box["w"]
    lower = upper + box["h"]
    return img.crop((left, upper, right, lower))


def write_response(obj: dict) -> None:
    # ensure_ascii=False so Japanese characters round-trip as UTF-8 bytes
    # instead of escaped \uXXXX sequences — the parent reads UTF-8.
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.write("\n")
    sys.stdout.flush()


def run_ocr(image_path: str, boxes: list[dict]) -> list[dict]:
    model = get_model()  # lazy load on first OCR call
    results: list[dict] = []
    for i, box in enumerate(boxes):
        try:
            crop = crop_pil(image_path, box)
            text = model(crop)  # manga-ocr's model is callable — returns str
            results.append({"box_index": i, "text": text})
        except Exception as e:
            results.append({
                "box_index": i,
                "text": "",
                "error": f"{type(e).__name__}: {e}",
            })
    return results


def handle_request(req: dict) -> None:
    op = req.get("op")
    corr_id = req.get("id")

    if op == "ping":
        write_response({"id": corr_id, "ok": True, "model_loaded": _model is not None})
        return

    if op == "shutdown":
        write_response({"id": corr_id, "ok": True, "shutting_down": True})
        sys.exit(0)

    if op == "ocr":
        try:
            results = run_ocr(req["image_path"], req.get("boxes", []))
            write_response({"id": corr_id, "results": results})
        except FileNotFoundError as e:
            write_response({"id": corr_id, "error": f"image not found: {e}"})
        except Exception as e:
            # Broad catch: a single bad OCR call must never crash the loop.
            # The desktop manager treats one error response as a per-request
            # failure, not a sidecar fault.
            write_response({"id": corr_id, "error": f"{type(e).__name__}: {e}"})
        return

    write_response({"id": corr_id, "error": f"unknown op: {op!r}"})


def main() -> None:
    # SIGTERM → graceful shutdown. Windows ignores SIGTERM in practice but
    # the registration is harmless and keeps the POSIX path clean.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    if hasattr(signal, "SIGINT"):
        signal.signal(signal.SIGINT, lambda *_: sys.exit(0))

    # Hint to the desktop manager that the process is up and reading stdin.
    write_response({"id": None, "ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as e:
            write_response({"id": None, "error": f"invalid JSON: {e}"})
            continue
        handle_request(req)


if __name__ == "__main__":
    main()
