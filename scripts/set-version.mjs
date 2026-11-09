#!/usr/bin/env node
// Stamps one version on every release surface: the root and desktop
// package.json, tauri.conf.json and `[workspace.package]` in Cargo.toml.
//
//   node scripts/set-version.mjs 1.0.0-rc.1
//
// The release workflow runs this with the version from the tag, so the
// installers, the updater feed and the About screen all report the tag even
// when the committed version is older. Cargo.lock goes stale for the
// workspace's own crates; the release build runs without `--locked` and the
// result is never committed. Only the first top-level `"version"` of each JSON
// file is rewritten, so the files keep their formatting.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SEMVER_RE =
  /^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

const JSON_TARGETS = [
  'package.json',
  'apps/desktop/package.json',
  'apps/desktop/src-tauri/tauri.conf.json',
];

const version = process.argv[2];
if (!version || !SEMVER_RE.test(version)) {
  console.error(`Usage: node scripts/set-version.mjs <semver>, got "${version ?? ''}"`);
  process.exit(1);
}

function rewrite(file, pattern, label) {
  const path = resolve(root, file);
  const text = readFileSync(path, 'utf8');
  if (!pattern.test(text)) {
    console.error(`No ${label} found in ${file}`);
    process.exit(1);
  }
  writeFileSync(path, text.replace(pattern, `$1${version}$2`));
  console.log(`  ${file}`);
}

for (const file of JSON_TARGETS) {
  // Fails loudly on a file that is not JSON before anything is written.
  JSON.parse(readFileSync(resolve(root, file), 'utf8'));
  rewrite(file, /^(\s{2}"version":\s*")[^"]*(")/m, 'top-level "version"');
}

// Anchored to the `[workspace.package]` header so a pinned dependency that
// spells its version on its own line is never touched.
rewrite('Cargo.toml', /(\[workspace\.package\][^[]*?\nversion = ")[^"]*(")/, 'workspace version');

console.log(`Release surfaces set to ${version}`);
