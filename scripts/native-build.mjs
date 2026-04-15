/**
 * Build the native C++ addon (bubble-detector) only on Windows.
 *
 * On non-Windows platforms this script exits 0 with a notice. If node-gyp
 * isn't installed (e.g. during early scaffolding / CI type-check jobs), the
 * build is skipped gracefully so `pnpm typecheck` / `pnpm build` can still
 * succeed without a C++ toolchain. Before the native source is filled in,
 * the binding.gyp `type: none` target keeps node-gyp happy when it is
 * available.
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import process from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nativeDir = resolve(__dirname, '..', 'native', 'bubble-detector');

if (process.platform !== 'win32') {
  console.log('Skipping native addon build (non-Windows platform)');
  process.exit(0);
}

if (!existsSync(nativeDir)) {
  console.log(`Skipping native addon build (no native/ at ${nativeDir})`);
  process.exit(0);
}

const probe = spawnSync('node-gyp', ['--version'], {
  shell: true,
  stdio: 'ignore',
});
if (probe.status !== 0) {
  console.log('Skipping native addon build (node-gyp not available on PATH)');
  process.exit(0);
}

const result = spawnSync('node-gyp', ['rebuild'], {
  shell: true,
  stdio: 'inherit',
  cwd: nativeDir,
});
if (result.status !== 0) {
  console.error('Native addon build failed');
  process.exit(result.status ?? 1);
}
