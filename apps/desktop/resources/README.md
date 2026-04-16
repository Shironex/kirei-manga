# Desktop Resources

`electron-builder` reads platform-specific app icons from this directory.
Both `extraResources` (renderer bundle) and `buildResources` (icons) point
here — `electron-builder.json` references the icon files below.

## Required files (release blocker for v0.1)

| File           | Platform | Format              | Required dimensions |
| -------------- | -------- | ------------------- | ------------------- |
| `icon.icns`    | macOS    | Apple Icon Image    | 512×512 @1x and @2x |
| `icon.ico`     | Windows  | Multi-res ICO       | 16, 32, 48, 256 px  |
| `icon.png`     | Linux    | PNG, 24-bit + alpha | 512×512 minimum     |

These are intentionally **not committed** in v0.1. Packaging
(`pnpm package` / `pnpm package:mac` / `pnpm package:win`) will fail until
they exist. See `CHANGELOG.md` → "Known Issues / Follow-ups".

## Recommended source

A 1024×1024 master in either SVG or PNG is enough — derive the platform
formats with one of:

- `electron-icon-builder` (npm) — single source → all three formats.
- `iconutil` (macOS, built-in) for `.icns` from a `.iconset` directory.
- `magick convert source.png -define icon:auto-resize=256,48,32,16 icon.ico`
  (ImageMagick) for `.ico`.

### Visual brief

The KireiManga mark is the kanji `綺` ("kirei", beautiful) on the bengara
red ground used as the app accent (see `apps/web/src/styles/globals.css`
for the exact hex). Keep generous bleed — Apple's rounded-rectangle mask
will clip ~10% on each edge. Use the same bone-white colour the UI uses
for foreground text.
