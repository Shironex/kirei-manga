# bubble-detector

C++ OpenCV native addon for the v0.3 translation pipeline. Exposes
`detectBubbles(imagePath): Promise<BoundingBox[]>` to the desktop process so
the orchestrator can crop each speech bubble out of a manga page before
shipping it to the OCR sidecar.

The v0.1 stub returned an empty array. v0.3 replaces it with a real OpenCV
implementation, statically linked, prebuilt per platform.

## Distribution strategy

OpenCV is built from source in CI and linked statically into a single
`.node` file per platform/arch. The build artifact is published via
[`prebuildify`](https://github.com/prebuild/prebuildify) and resolved at
runtime via [`node-gyp-build`](https://github.com/prebuild/node-gyp-build).
Nothing about OpenCV — sources, object files, static archives, or the
finished `.node` — is committed to git. `prebuilds/` and `vendor/` are both
gitignored. CI builds the addon for `win32-x64`, `darwin-x64`, and
`darwin-arm64` and uploads the resulting `prebuilds/{platform}-{arch}/*.node`
files as release assets. Contributors have two paths: download the latest CI
prebuild for the current commit, or build OpenCV locally one time and let
`node-gyp` link against it on every rebuild.

## OpenCV pin

- `OPENCV_VERSION=4.11.0`
- SHA256 placeholder lands with B.1b's `scripts/build-opencv.{sh,ps1}`.
- Bumping is a chore commit + a CI rerun; no contributor action required
  beyond re-running the build script.

## Build flags

The CI and local build scripts will invoke cmake with:

- `-DBUILD_LIST=core,imgproc,imgcodecs`
- `-DBUILD_SHARED_LIBS=OFF`
- `-DBUILD_PNG=ON`
- `-DBUILD_JPEG=ON`
- `-DBUILD_ZLIB=ON`
- `-DBUILD_TESTS=OFF`
- `-DBUILD_PERF_TESTS=OFF`
- `-DBUILD_EXAMPLES=OFF`
- `-DBUILD_JAVA=OFF`
- `-DBUILD_opencv_python2=OFF`
- `-DBUILD_opencv_python3=OFF`
- `-DWITH_FFMPEG=OFF`
- `-DWITH_GTK=OFF`
- `-DWITH_QT=OFF`
- `-DWITH_TIFF=OFF`
- `-DWITH_WEBP=OFF`

Result: ~+200 KB of source/script in the repo, ~+10 MB per platform added to
the installed `.node` (and therefore to the electron-builder installer).

## Local development

### Use a CI prebuild

```bash
pnpm fetch-prebuilds
```

The script (lands in B.1b/B.4) downloads the latest CI artifact for the
current commit into `native/bubble-detector/prebuilds/{platform}-{arch}/`.
`node-gyp-build` resolves it on `require()`. Zero local toolchain needed
beyond Node.

### Build OpenCV locally

```bash
# Windows
pwsh native/bubble-detector/scripts/build-opencv.ps1

# macOS / Linux
bash native/bubble-detector/scripts/build-opencv.sh
```

One-time cost: ~25 min on Windows, ~12 min on macOS arm64. The script
downloads + verifies the OpenCV tarball, runs cmake with the flags above,
builds into `vendor/opencv-build/`, and writes `OPENCV_INCLUDE_DIR` and
`OPENCV_LIB_DIR` for `binding.gyp` to pick up. Subsequent
`pnpm native:build` runs only relink the addon, not OpenCV.

### Skip the addon entirely

For contributors not touching translation: do nothing. `native-build.mjs`
detects the missing OpenCV install, prints a clear `skipped — no OpenCV
available` message, and exits 0. The desktop app loads, the translation
provider is marked unhealthy via `translation:provider-status`, and the rest
of the app behaves normally.

## Layout

After B.1b lands, the directory looks like:

```
native/bubble-detector/
  binding.gyp
  package.json
  index.js                 # node-gyp-build entry
  src/
    detector.cpp
  scripts/
    build-opencv.sh
    build-opencv.ps1
  prebuilds/               # gitignored — CI artifacts or local rebuilds
  vendor/
    opencv-build/          # gitignored — local OpenCV build output
```

## Apple Silicon vs Intel

Two separate `.node` files: `darwin-arm64` and `darwin-x64`. No universal
binary — keeps each addon small and avoids the `lipo` step in CI. The
electron-builder mac targets pick the right one at packaging time.

## License attribution

- OpenCV — Apache License 2.0
- libpng / zlib — zlib license
- libjpeg-turbo — BSD-3-Clause + IJG

`NOTICE` and `LICENSE` files for these dependencies will land in
`apps/desktop/resources/` in Slice B.4 alongside the rest of the CI
packaging work.

See [`../../docs/v0.3-roadmap.md`](../../docs/v0.3-roadmap.md) for the
slice plan this addon belongs to.
