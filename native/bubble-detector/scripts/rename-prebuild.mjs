#!/usr/bin/env node
/**
 * Post-prebuildify rename: rewrite the produced `.node` filename to a tag
 * `node-gyp-build` actually recognizes.
 *
 * `prebuildify --napi` names the output file after the package
 * (`@kireimanga+bubble-detector.node`). `node-gyp-build@4` ignores files
 * whose tag chain doesn't include any of {runtime, napi, abi, uv, libc,
 * armv}, so that filename is treated as having specificity 0 and never
 * resolves at boot — bubble-detector silently goes unhealthy in Electron.
 *
 * `node.napi.node` parses to `{ runtime: 'node', napi: true }`, which is
 * runtime-agnostic and matches both Node and Electron. Drop a copy at that
 * name (rename, then leave the original behind in case anything in CI
 * still asserts on the canonical prebuildify name).
 */
import { existsSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const addonDir = resolve(__dirname, '..');
const platformArch = `${process.platform}-${process.arch}`;
const prebuildDir = join(addonDir, 'prebuilds', platformArch);

if (!existsSync(prebuildDir)) {
  console.error(`rename-prebuild: ${prebuildDir} does not exist`);
  process.exit(1);
}

const targetName = 'node.napi.node';
const target = join(prebuildDir, targetName);
const candidates = readdirSync(prebuildDir).filter(
  f => f.endsWith('.node') && f !== targetName
);

if (candidates.length === 0) {
  if (existsSync(target)) {
    console.log(`rename-prebuild: ${targetName} already present`);
    process.exit(0);
  }
  console.error(`rename-prebuild: no .node file found in ${prebuildDir}`);
  process.exit(1);
}

// Multiple candidates would mean we're running across CI matrix runs in one
// folder — pick the most recent.
const source = candidates
  .map(f => ({ f, mtime: 0 }))
  .map(o => {
    o.mtime = readdirSync(prebuildDir, { withFileTypes: true }).find(
      d => d.name === o.f
    )
      ? Date.now()
      : 0;
    return o;
  })[0].f;

copyFileSync(join(prebuildDir, source), target);
console.log(`rename-prebuild: ${source} -> ${targetName}`);
