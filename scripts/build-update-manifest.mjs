#!/usr/bin/env node
// Builds `latest.json`, the feed the in-app updater reads, from a folder of
// signed bundles. See docs/release.md.
//
//   node scripts/build-update-manifest.mjs \
//     --artifacts <dir> --out <dir> --version <semver> --tag <tag> --repo <owner/name> \
//     [--notes <text>] [--pub-date <iso>]
//
//   node scripts/build-update-manifest.mjs --self-test
//
// One entry per updater artifact: the NSIS installer on Windows and the
// `.app.tar.gz` per macOS architecture. The DMG installs, it never updates.
// Every platform is required: a feed that silently dropped one would strand
// that platform on the release it has. An artifact without a minisign
// signature is a build that ran without TAURI_SIGNING_PRIVATE_KEY, and fails
// here rather than in every client at install time.
//
// Node builtins only, so the workflow runs it without installing the workspace.
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

/** The `{os}-{arch}` keys tauri-plugin-updater looks up, all of them required. */
export const REQUIRED_PLATFORMS = ['windows-x86_64', 'darwin-aarch64', 'darwin-x86_64'];

/**
 * The feed key of an updater artifact, from its file name, or null for
 * anything else (DMGs, `.sig` files). Tauri writes the macOS archive as a bare
 * `KireiManga.app.tar.gz`; the workflow renames it with the architecture, and
 * one that arrives without it is refused rather than guessed.
 */
export function platformOf(fileName) {
  if (fileName.endsWith('-setup.exe')) {
    if (/_x64-setup\.exe$/.test(fileName)) return 'windows-x86_64';
    throw new Error(`${fileName}: only x64 Windows installers are released`);
  }
  if (fileName.endsWith('.app.tar.gz')) {
    if (/_aarch64\.app\.tar\.gz$/.test(fileName)) return 'darwin-aarch64';
    if (/_x64\.app\.tar\.gz$/.test(fileName)) return 'darwin-x86_64';
    throw new Error(`${fileName} carries no arch, rename it to <name>_<version>_<arch>.app.tar.gz`);
  }
  return null;
}

export function assetUrl(repo, tag, fileName) {
  return `https://github.com/${repo}/releases/download/${tag}/${fileName}`;
}

/** The feed, from `{ fileName, signature }` entries. Throws on any gap. */
export function buildLatestJson({ version, notes, pubDate, repo, tag, artifacts }) {
  const platforms = {};
  for (const { fileName, signature } of artifacts) {
    const key = platformOf(fileName);
    if (!key) continue;
    if (!signature) throw new Error(`${fileName} has no minisign signature, was the build signed?`);
    if (platforms[key]) throw new Error(`two updater artifacts for ${key}`);
    platforms[key] = { signature, url: assetUrl(repo, tag, fileName) };
  }
  const missing = REQUIRED_PLATFORMS.filter(key => !platforms[key]);
  if (missing.length > 0) {
    throw new Error(`latest.json would carry no entry for ${missing.join(', ')}`);
  }
  return { version, notes, pub_date: pubDate, platforms };
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() ? [full] : [];
  });
}

function collect(dir) {
  const files = walk(dir);
  const sigs = new Map(
    files.filter(f => f.endsWith('.sig')).map(f => [basename(f).slice(0, -'.sig'.length), f])
  );
  return files
    .filter(f => !f.endsWith('.sig'))
    .map(f => {
      const fileName = basename(f);
      const sig = sigs.get(fileName);
      return { fileName, signature: sig ? readFileSync(sig, 'utf8').trim() : null };
    });
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else args[key] = argv[++i];
  }
  return args;
}

function selfTest() {
  const assert = (ok, message) => {
    if (!ok) throw new Error(`self-test: ${message}`);
  };
  const mustThrow = (fn, label) => {
    try {
      fn();
    } catch {
      return;
    }
    throw new Error(`self-test: ${label} was not refused`);
  };
  const base = { version: '1.0.0', notes: '', pubDate: '', repo: 'o/r', tag: 'v1.0.0' };
  const artifacts = [
    { fileName: 'KireiManga_1.0.0_x64-setup.exe', signature: 'c2lnMQ==' },
    { fileName: 'KireiManga_1.0.0_aarch64.app.tar.gz', signature: 'c2lnMg==' },
    { fileName: 'KireiManga_1.0.0_x64.app.tar.gz', signature: 'c2lnMw==' },
    { fileName: 'KireiManga_1.0.0_aarch64.dmg', signature: null },
  ];

  const feed = buildLatestJson({ ...base, artifacts });
  assert(
    Object.keys(feed.platforms).sort().join() === [...REQUIRED_PLATFORMS].sort().join(),
    `wrong platforms: ${Object.keys(feed.platforms).join()}`
  );
  assert(
    feed.platforms['darwin-x86_64'].url ===
      'https://github.com/o/r/releases/download/v1.0.0/KireiManga_1.0.0_x64.app.tar.gz',
    'the Intel entry must point at the Intel archive'
  );
  assert(feed.platforms['windows-x86_64'].signature === 'c2lnMQ==', 'signature carried');

  mustThrow(
    () => buildLatestJson({ ...base, artifacts: artifacts.slice(0, 2) }),
    'a feed without darwin-x86_64'
  );
  mustThrow(
    () =>
      buildLatestJson({ ...base, artifacts: [{ ...artifacts[0], signature: null }, ...artifacts] }),
    'an unsigned installer'
  );
  mustThrow(() => platformOf('KireiManga.app.tar.gz'), 'an archive without an arch');
  mustThrow(
    () =>
      buildLatestJson({
        ...base,
        artifacts: [...artifacts, { fileName: 'Other_1.0.0_x64-setup.exe', signature: 'eA==' }],
      }),
    'two installers for one platform'
  );
  console.log('build-update-manifest self-test: OK');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['self-test']) {
    selfTest();
    return;
  }
  const required = ['artifacts', 'out', 'version', 'tag', 'repo'];
  const missing = required.filter(key => typeof args[key] !== 'string');
  if (missing.length > 0) {
    console.error(`Missing arguments: ${missing.map(k => `--${k}`).join(', ')}`);
    process.exit(1);
  }
  const feed = buildLatestJson({
    version: args.version,
    notes: typeof args.notes === 'string' ? args.notes : '',
    pubDate: typeof args['pub-date'] === 'string' ? args['pub-date'] : new Date().toISOString(),
    repo: args.repo,
    tag: args.tag,
    artifacts: collect(resolve(args.artifacts)),
  });
  const out = resolve(args.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'latest.json'), `${JSON.stringify(feed, null, 2)}\n`);
  console.log(`latest.json platforms: ${Object.keys(feed.platforms).join(', ')}`);
}

main();
