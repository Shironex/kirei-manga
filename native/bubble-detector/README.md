# bubble-detector

Native C++ addon for speech-bubble detection. Built with node-addon-api.

## Status

v0.1 — stub. `detectBubbles(imagePath)` returns an empty array. The production
OpenCV-backed implementation lands with v0.3 (see the project PRD §9).

## Build

```bash
# From the repo root, Windows only:
pnpm native:build
```

On non-Windows platforms the addon compiles to a `type: none` target so
`node-gyp` succeeds without an actual binary (the bubble detector is
Windows-first in v0.3; macOS support comes later).
