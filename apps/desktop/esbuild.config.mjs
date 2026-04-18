import { build } from 'esbuild';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { esbuildDecorators } from '@anatine/esbuild-decorators';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Clean dist/main/ before bundling to prevent stale artifact accumulation
const outdir = 'dist/main';
if (existsSync(outdir)) {
  rmSync(outdir, { recursive: true });
}
mkdirSync(outdir, { recursive: true });

// Externalize npm dependencies — they're bundled by electron-builder at package
// time via node_modules. Workspace packages stay bundled to avoid
// workspace-protocol resolution issues in production builds — except for
// native addons whose loader uses `__dirname` to find their prebuild.
// Inlining `@kireimanga/bubble-detector/index.js` (which calls
// `node-gyp-build(__dirname)`) would make __dirname resolve to dist/main
// at runtime; node-gyp-build then searches for prebuilds under dist/main
// and the addon silently goes unhealthy in Electron. Keeping this require
// live preserves the addon's own __dirname (workspace symlink →
// native/bubble-detector) so the prebuild resolves. electron-builder
// already unpacks the prebuilds out of asar (`asarUnpack` rule) so
// production gets the same lookup path.
const NATIVE_WORKSPACE_DEPS = ['@kireimanga/bubble-detector'];

const external = [
  'electron',
  ...NATIVE_WORKSPACE_DEPS,
  ...Object.keys(pkg.dependencies ?? {}).filter(d => !d.startsWith('@kireimanga/')),
];

await build({
  entryPoints: ['src/main/index.ts', 'src/main/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outdir: 'dist/main',
  sourcemap: true,
  external,
  plugins: [
    esbuildDecorators({
      tsconfig: './tsconfig.build.json',
    }),
  ],
  logLevel: 'info',
});
