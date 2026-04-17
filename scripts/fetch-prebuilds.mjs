/**
 * Fetch the latest CI bubble-detector prebuild via the GitHub CLI.
 *
 * Usage:
 *   node scripts/fetch-prebuilds.mjs            # current platform/arch only
 *   node scripts/fetch-prebuilds.mjs --all-platforms
 *   node scripts/fetch-prebuilds.mjs --help
 *
 * The B.1a README promised a `pnpm fetch-prebuilds` so contributors who don't
 * want to build OpenCV locally (~12–25 min) can pull the latest CI artifact
 * for the current branch (or master fallback) and have `node-gyp-build`
 * resolve a `.node` on `require('@kireimanga/bubble-detector')`.
 *
 * Strategy:
 *   1. `gh` CLI must be installed + authenticated. We do not paper over that —
 *      missing/unauthenticated `gh` exits 1 with an actionable message.
 *   2. Find the most recent successful CI run on the current branch
 *      (fallback: master) that produced the artifact we want.
 *   3. `gh run download <run-id> --name bubble-detector-{platform}-{arch}`
 *      into `native/bubble-detector/prebuilds/{platform}-{arch}/`.
 *   4. Print a one-line confirmation per artifact with the file size.
 *
 * Mirrors the logging + error-handling style of `scripts/native-build.mjs`.
 * Uses `spawnSync` exclusively (no `exec`) to keep argv arrays away from any
 * shell — the security reminder hook flags `exec` for good reason.
 */

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import process from 'process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');
const prebuildsRoot = resolve(
  repoRoot,
  'native',
  'bubble-detector',
  'prebuilds'
);

const SUPPORTED = [
  { platform: 'win32', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'darwin', arch: 'x64' },
];

const argv = process.argv.slice(2);

if (argv.includes('--help') || argv.includes('-h')) {
  printUsage();
  process.exit(0);
}

const wantAll = argv.includes('--all-platforms');

if (!hasGh()) {
  console.error(
    [
      '✗ `gh` CLI not found on PATH.',
      '  Install it from https://cli.github.com/ and run `gh auth login`,',
      '  or build OpenCV locally instead via',
      '    pnpm --filter @kireimanga/bubble-detector run build:opencv:posix',
      '  (or `:win` on Windows) and then `pnpm native:build`.',
    ].join('\n')
  );
  process.exit(1);
}

if (!isGhAuthenticated()) {
  console.error(
    [
      '✗ `gh` CLI is installed but not authenticated.',
      '  Run `gh auth login` and retry.',
    ].join('\n')
  );
  process.exit(1);
}

const targets = wantAll
  ? SUPPORTED
  : [{ platform: process.platform, arch: process.arch }];

if (
  !wantAll &&
  !SUPPORTED.find(
    (t) => t.platform === targets[0].platform && t.arch === targets[0].arch
  )
) {
  console.error(
    `✗ No prebuilds published for ${targets[0].platform}-${targets[0].arch}. ` +
      `Supported: ${SUPPORTED.map((t) => `${t.platform}-${t.arch}`).join(', ')}.`
  );
  process.exit(1);
}

const branch = getCurrentBranch();
const runId = findLatestSuccessfulCiRun(branch);
if (!runId) {
  console.error(
    [
      `✗ No successful CI run with the bubble-detector artifact found on \`${branch}\`.`,
      '  Check https://github.com/Shironex/kirei-manga/actions/workflows/ci.yml',
      '  or push a commit touching native/** to trigger the matrix.',
    ].join('\n')
  );
  process.exit(1);
}

console.log(`==> Using CI run ${runId} on ${branch}`);

let downloaded = 0;
for (const target of targets) {
  const ok = downloadArtifact(runId, target);
  if (ok) downloaded += 1;
}

if (downloaded === 0) {
  console.error('✗ No artifacts were downloaded.');
  process.exit(1);
}

console.log(
  `✓ Done — ${downloaded} prebuild(s) ready under ${prebuildsRoot}`
);

function printUsage() {
  console.log(
    [
      'Usage: node scripts/fetch-prebuilds.mjs [options]',
      '',
      'Downloads the latest CI bubble-detector prebuild artifact via `gh`.',
      '',
      'Options:',
      '  --all-platforms    Download every supported platform/arch.',
      '                     Default: current host only.',
      '  -h, --help         Show this message.',
      '',
      'Supported targets:',
      ...SUPPORTED.map((t) => `  - ${t.platform}-${t.arch}`),
    ].join('\n')
  );
}

function hasGh() {
  const r = spawnSync('gh', ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

function isGhAuthenticated() {
  const r = spawnSync('gh', ['auth', 'status'], { stdio: 'ignore' });
  return r.status === 0;
}

function getCurrentBranch() {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (r.status !== 0) return 'master';
  return (r.stdout ?? '').trim() || 'master';
}

function findLatestSuccessfulCiRun(branch) {
  // gh returns the most recent runs first. We want a CI workflow run that
  // both succeeded AND produced the bubble-detector artifact (paths-gated, so
  // a run on a branch that didn't touch native/** will be successful but
  // empty — fall through to the next).
  const candidates = listRecentCiRuns(branch, 20);
  for (const id of candidates) {
    if (runHasBubbleDetectorArtifact(id)) return id;
  }
  // Branch fallback: try master if we weren't already on it.
  if (branch !== 'master') {
    console.warn(
      `  No prebuild artifact found on \`${branch}\` — falling back to master.`
    );
    const fallback = listRecentCiRuns('master', 20);
    for (const id of fallback) {
      if (runHasBubbleDetectorArtifact(id)) return id;
    }
  }
  return null;
}

function listRecentCiRuns(branch, limit) {
  const r = spawnSync(
    'gh',
    [
      'run',
      'list',
      '--workflow',
      'ci.yml',
      '--branch',
      branch,
      '--status',
      'success',
      '--limit',
      String(limit),
      '--json',
      'databaseId',
    ],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (r.status !== 0) {
    console.warn(
      `  Failed to list CI runs for ${branch}: ${(r.stderr ?? '').trim() || `exit ${r.status}`}`
    );
    return [];
  }
  try {
    const parsed = JSON.parse(r.stdout);
    return parsed.map((run) => String(run.databaseId));
  } catch {
    return [];
  }
}

function runHasBubbleDetectorArtifact(runId) {
  const r = spawnSync(
    'gh',
    ['run', 'view', runId, '--json', 'artifacts'],
    { cwd: repoRoot, encoding: 'utf8' }
  );
  if (r.status !== 0) return false;
  try {
    const parsed = JSON.parse(r.stdout);
    return (parsed.artifacts ?? []).some((a) =>
      String(a.name).startsWith('bubble-detector-')
    );
  } catch {
    return false;
  }
}

function downloadArtifact(runId, { platform, arch }) {
  const name = `bubble-detector-${platform}-${arch}`;
  const dest = join(prebuildsRoot, `${platform}-${arch}`);

  // Clean stale .node before download so we don't merge old + new.
  if (existsSync(dest)) {
    for (const entry of readdirSync(dest)) {
      if (entry.endsWith('.node')) rmSync(join(dest, entry));
    }
  } else {
    mkdirSync(dest, { recursive: true });
  }

  const result = spawnSync(
    'gh',
    ['run', 'download', runId, '--name', name, '--dir', dest],
    { cwd: repoRoot, encoding: 'utf8' }
  );

  if (result.status !== 0) {
    const stderr = (result.stderr ?? '').trim();
    console.warn(
      `✗ Failed to fetch ${name}: ${stderr || `exit ${result.status}`}`
    );
    return false;
  }

  const sizeBytes = nodeFileSize(dest);
  const sizePretty = sizeBytes
    ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`
    : 'unknown size';
  console.log(
    `✓ Fetched bubble-detector prebuild for ${platform}-${arch} (${sizePretty})`
  );
  return true;
}

function nodeFileSize(dir) {
  try {
    const nodes = readdirSync(dir).filter((f) => f.endsWith('.node'));
    let total = 0;
    for (const f of nodes) {
      total += statSync(join(dir, f)).size;
    }
    return total;
  } catch {
    return 0;
  }
}
