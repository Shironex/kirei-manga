/**
 * Build the native C++ addon (bubble-detector).
 *
 * Strategy:
 *   1. If a prebuilt `.node` already exists for this platform/arch, skip.
 *   2. Else if OPENCV_INCLUDE_DIR + OPENCV_LIB_DIR are set + valid,
 *      run `prebuildify` (or fall back to `node-gyp rebuild`).
 *   3. Else log a clear "skipped — no OpenCV available" message and exit 0.
 *      The desktop app boots; the translation provider self-marks unhealthy
 *      via `translation:provider-status` per the v0.3 cross-cutting rule.
 */

import { spawnSync } from 'child_process';
import { existsSync, readdirSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import process from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nativeDir = resolve(__dirname, '..', 'native', 'bubble-detector');

if (!existsSync(nativeDir)) {
  console.log(`Skipping native addon build (no native/ at ${nativeDir})`);
  process.exit(0);
}

// 1. Existing prebuild → done.
const prebuildDir = resolve(
  nativeDir,
  'prebuilds',
  `${process.platform}-${process.arch}`
);
if (existsSync(prebuildDir)) {
  const hasNode = readdirSync(prebuildDir).some((f) => f.endsWith('.node'));
  if (hasNode) {
    console.log(`✓ Using existing prebuild at ${prebuildDir}`);
    process.exit(0);
  }
}

// 2. OpenCV env present + dirs exist → build.
const openCvInclude = process.env.OPENCV_INCLUDE_DIR;
const openCvLib = process.env.OPENCV_LIB_DIR;
const haveOpenCv =
  openCvInclude &&
  openCvLib &&
  isExistingDir(openCvInclude) &&
  isExistingDir(openCvLib);

if (!haveOpenCv) {
  const winHint =
    'pnpm --filter @kireimanga/bubble-detector run build:opencv:win';
  const posixHint =
    'pnpm --filter @kireimanga/bubble-detector run build:opencv:posix';
  const buildHint = process.platform === 'win32' ? winHint : posixHint;
  console.warn(
    [
      '⚠ bubble-detector skipped — no OpenCV available.',
      `  Run \`${buildHint}\` to build OpenCV locally,`,
      '  OR fetch a CI prebuild via `pnpm fetch-prebuilds` (lands in B.4).',
      '  The desktop app will boot; translation provider self-marks unhealthy.',
    ].join('\n')
  );
  process.exit(0);
}

const nodeAddonApi = resolve(nativeDir, 'node_modules', 'node-addon-api');
if (!existsSync(nodeAddonApi)) {
  console.warn(
    '⚠ bubble-detector skipped — node-addon-api not installed in native/bubble-detector.'
  );
  process.exit(0);
}

// 3. Prefer prebuildify (yields a portable prebuilds/{platform}-{arch}/*.node);
//    fall back to node-gyp rebuild if prebuildify isn't on PATH yet.
const prebuildifyResult = spawnSync(
  'pnpm',
  [
    '--filter',
    '@kireimanga/bubble-detector',
    'exec',
    'prebuildify',
    '--napi',
    '--strip',
  ],
  { shell: true, stdio: 'inherit' }
);

if (prebuildifyResult.status === 0) {
  console.log('✓ bubble-detector prebuild emitted');
  process.exit(0);
}

console.warn('prebuildify unavailable or failed — falling back to node-gyp rebuild');

const gypProbe = spawnSync('node-gyp', ['--version'], {
  shell: true,
  stdio: 'ignore',
});
if (gypProbe.status !== 0) {
  console.warn(
    '⚠ bubble-detector skipped — neither prebuildify nor node-gyp on PATH.'
  );
  process.exit(0);
}

const result = spawnSync('node-gyp', ['rebuild'], {
  shell: true,
  stdio: 'inherit',
  cwd: nativeDir,
});
if (result.status !== 0) {
  console.warn(
    '⚠ bubble-detector build failed — continuing without addon (translation will self-disable).'
  );
  process.exit(0);
}

console.log('✓ bubble-detector built via node-gyp');

function isExistingDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
