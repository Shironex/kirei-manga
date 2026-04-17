# Translation pipeline test fixtures

Tiny committed fixtures for `bubble-detector.smoke.spec.ts` and (future) OCR
sidecar smoke tests.

## `blank-bubble.png`

100x100 8-bit grayscale solid-white PNG. ~118 bytes — small enough to commit,
real enough to prove the bubble-detector addon's full path:

- `node-gyp-build` resolves a prebuild
- OpenCV's `cv::imread` decodes the PNG
- `Napi::AsyncWorker` runs to completion and resolves the Promise
- `image-size` reads `width`/`height` off the header
- `BubbleDetectorService.detect()` populates `boxes`, `imageWidth`, `imageHeight`, `durationMs`

The smoke test asserts shape, not content — a blank page should yield zero
bubbles, which is the same assertion the C++ unit suite makes against an
in-process `cv::Mat` (`test/detector_test.cpp`, `BlankPageReturnsNoBubbles`).

## Regenerating

The fixture was generated once by a Node one-liner that builds the PNG bytes
by hand (CRC tables + zlib deflate). No runtime dep — `pngjs` was considered
and rejected because we only ever need this single fixture. To regenerate
(e.g. if the smoke test ever needs a different size):

```bash
node -e "
const zlib = require('zlib');
const fs = require('fs');
const W = 100, H = 100;

let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

const sig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(W, 0xFF)]);
const raw = Buffer.alloc(H * row.length);
for (let y = 0; y < H; y++) row.copy(raw, y * row.length);
const idat = zlib.deflateSync(raw, { level: 9 });

fs.writeFileSync(
  'apps/desktop/test/fixtures/translation/blank-bubble.png',
  Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
);
"
```

Run from the repo root.
