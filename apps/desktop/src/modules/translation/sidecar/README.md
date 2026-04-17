# OCR sidecar (Slice D.4)

The `manga-ocr` Python sidecar runs as a long-lived child process of the
desktop main process. It performs OCR on the speech-bubble crops produced by
the C++ bubble detector (Slice B/C). This folder is the TypeScript side of
the contract — see `sidecar/manga-ocr/main.py` for the Python side and
`docs/v0.3-roadmap.md` §"Slice D" for the slice plan.

## Why a sidecar instead of a native addon

The PyTorch transformer model is ~450MB and a Node native addon would mean
re-compiling PyTorch + tokenizer ops per platform per Electron version. A
sidecar is a black box: build once with PyInstaller, ship a single binary
per platform, talk to it over stdio. If it crashes the rest of the desktop
keeps working.

## Lifecycle

```
not-downloaded ──[ensureReady, first time]──> downloading
                                                 │
                                                 ▼
                                              starting ──[{ready:true}]──> ready
                                                 │                            │
                                                 │                            ▼
                                                 │                          ocr / ping (in-flight)
                                                 │                            │
                                                 │              ┌─────────────┴─────────────┐
                                                 │       (graceful)                    (unexpected)
                                                 │              ▼                            ▼
                                                 │           shutdown                     crashed
                                                 │                                           │
                                                 │                          ┌────────────────┴─────────────────┐
                                                 │                          ▼                                  ▼
                                                 │                 restart < 3 (1s/2s/4s)                   restart >= 3
                                                 │                          │                                  │
                                                 │                          ▼                                  ▼
                                                 │                       starting                          unhealthy
                                                 │                                                            │
                                                 └──────────────  (manual ensureReady() resets) ──────────────┘
```

## Invariants

- **Lazy spawn.** First `ocr()` triggers the binary download (if not
  present) and the spawn. Boot time stays under a second.
- **Max-concurrency 1.** OCR is CPU/GPU bound; queueing more requests just
  thrashes the model. `ocr()` calls past the first one wait in FIFO order.
- **60s per-request timeout.** A typical 30-bubble page finishes in <5s; a
  hung request rejects with `OcrSidecarError('… timed out …')`.
- **Exponential restart backoff: 1s, 2s, 4s.** Three consecutive crashes
  flip the service to `unhealthy`. Slice K's Tesseract fallback takes over
  while the user investigates.
- **Correlation IDs.** Every request carries a monotonic string id; the
  service dispatches stdout responses to the matching pending promise.
- **Per-box errors don't fail the page.** The Python sidecar returns
  `{box_index, text:'', error}` for individual crop failures; the service
  surfaces those as `{boxIndex, text: ''}` so the orchestrator can choose
  to skip or surface them.
- **Graceful shutdown via NestJS `OnModuleDestroy`.** Sends `{op:'shutdown'}`,
  waits up to 5s for exit, then `SIGTERM`. The Python side handles the
  signal.

## Files

| File                          | Role                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `ocr-sidecar.service.ts`      | Spawn, IPC, queue, timeouts, restart loop, lifecycle.     |
| `ocr-sidecar-downloader.ts`   | On-first-use tarball fetch from the GitHub Release asset. |
| `ocr-sidecar.types.ts`        | `OcrSidecarStatus`, `OcrRequestBox` shared types.         |
| `ocr-sidecar.service.spec.ts` | Jest coverage for the lifecycle invariants above.         |

## Not in this slice

- `translation:provider-status` IPC channel (Slice D.5).
- Tesseract fallback when sidecar goes unhealthy (Slice K).
- Renderer download-progress UI (Slice G).
- Wiring into `TranslationGateway` (Slice F).
