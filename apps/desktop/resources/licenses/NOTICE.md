# Third-party notices — KireiManga desktop

KireiManga's `bubble-detector` native addon links statically against OpenCV
4.11.0 and the bundled image-codec dependencies OpenCV pulls in at build
time. Their license terms travel with every installer we ship.

If you obtained KireiManga as a distributed installer, the licenses below
apply to the binary code embedded in the `@kireimanga/bubble-detector`
`.node` file under `resources/app.asar.unpacked/...prebuilds/...`.

## Bundled libraries

| Library         | Version | License             | Source                                                                |
| --------------- | ------- | ------------------- | --------------------------------------------------------------------- |
| OpenCV          | 4.11.0  | Apache License 2.0  | https://github.com/opencv/opencv/blob/4.11.0/LICENSE                  |
| libpng          | bundled | libpng / zlib-style | https://github.com/opencv/opencv/blob/4.11.0/3rdparty/libpng/LICENSE  |
| libjpeg-turbo   | bundled | BSD-3-Clause + IJG  | https://github.com/opencv/opencv/blob/4.11.0/3rdparty/libjpeg-turbo/LICENSE.md |
| zlib            | bundled | zlib license        | https://github.com/opencv/opencv/blob/4.11.0/3rdparty/zlib/README     |

The "bundled" versions are whatever upstream OpenCV 4.11.0 ships under its
`3rdparty/` tree at the time of build — see `native/bubble-detector/scripts/build-opencv.{sh,ps1}`
for the pinned tarball SHA256.

## Verbatim license texts

The full text of each license is reproduced alongside this file:

- `OpenCV-LICENSE.txt`
- `libpng-LICENSE.txt`
- `libjpeg-turbo-LICENSE.txt`
- `zlib-LICENSE.txt`

If any of those files are stamped `-TODO` instead of containing the verbatim
text, the source-of-truth is the URL in the table above and the relevant
license text must be checked in before the next public installer ships.

## Where this folder ends up

`apps/desktop/electron-builder.json` adds this directory to `extraResources`
so the packaged installer ships it as `resources/licenses/` next to the
icons. End-users can browse it offline.
