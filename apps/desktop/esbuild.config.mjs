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
// workspace-protocol resolution issues in production builds.
const external = [
  'electron',
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
