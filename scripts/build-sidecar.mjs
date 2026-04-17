/**
 * Build the manga-ocr Python sidecar via PyInstaller.
 *
 * Thin shim around `python sidecar/manga-ocr/build.py` that:
 *   1. Verifies the venv at `sidecar/manga-ocr/.venv/` exists.
 *      If not, prints a clear "create the venv first" message and exits 1.
 *   2. Invokes the venv's interpreter against build.py from the sidecar dir,
 *      forwarding any extra argv (--clean, --no-strip).
 *
 * Mirrors the logging style of `scripts/native-build.mjs`. Used by CI and
 * by contributors who prefer `pnpm build:sidecar` over remembering the
 * venv-activation dance.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sidecarDir = resolve(__dirname, '..', 'sidecar', 'manga-ocr');
const venvDir = resolve(sidecarDir, '.venv');
const buildScript = resolve(sidecarDir, 'build.py');

if (!existsSync(buildScript)) {
  console.error(`✗ build.py not found at ${buildScript}`);
  process.exit(1);
}

const venvPython =
  process.platform === 'win32'
    ? resolve(venvDir, 'Scripts', 'python.exe')
    : resolve(venvDir, 'bin', 'python');

if (!existsSync(venvPython)) {
  const activate =
    process.platform === 'win32'
      ? '.venv\\Scripts\\activate'
      : 'source .venv/bin/activate';
  console.error(
    [
      `✗ sidecar venv not found at ${venvDir}`,
      '  Create it first:',
      '',
      '    cd sidecar/manga-ocr',
      '    python -m venv .venv',
      `    ${activate}`,
      '    pip install -r requirements.txt -r requirements-build.txt',
      '',
      '  Then re-run `pnpm build:sidecar`.',
    ].join('\n')
  );
  process.exit(1);
}

const forwardedArgs = process.argv.slice(2);

console.log(`==> Building manga-ocr sidecar via ${venvPython}`);

const result = spawnSync(venvPython, [buildScript, ...forwardedArgs], {
  cwd: sidecarDir,
  stdio: 'inherit',
});

if (result.status !== 0) {
  console.error(
    `✗ build.py exited with status ${result.status ?? 'unknown'}`
  );
  process.exit(result.status ?? 1);
}

console.log('✓ sidecar build complete');
