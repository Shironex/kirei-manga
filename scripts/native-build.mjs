/**
 * Build the native C++ addon (bubble-detector) only on Windows.
 *
 * Skipped gracefully when:
 *   - platform is not win32 (macOS support lands later);
 *   - `native/bubble-detector` doesn't exist;
 *   - `node-gyp` isn't on PATH;
 *   - `node-addon-api` hasn't been installed inside the native package yet
 *     (binding.gyp requires it at configure time).
 *
 * Before the native source is filled in, the binding.gyp `type: none`
 * target keeps node-gyp happy when it is available.
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

const nodeAddonApi = resolve(nativeDir, 'node_modules', 'node-addon-api');
if (!existsSync(nodeAddonApi)) {
  console.log(
    'Skipping native addon build (node-addon-api not installed in native/bubble-detector)'
  );
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
