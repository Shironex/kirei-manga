#!/usr/bin/env node
// Drafts the GitHub release notes for a tag from its conventional commits.
// See docs/release.md.
//
//   node scripts/release-notes.mjs --tag v1.0.0 --repo Shironex/kirei-manga --out notes.md
//   node scripts/release-notes.mjs --self-test
//
// Shape: a short intro, Highlights, What's New (one heading per scope), Bug
// Fixes, Performance, Accessibility, Under the Hood, Dependencies, then the
// Pull requests list and the Full changelog link. Empty sections are left out.
// Highlights and the intro are a draft: edit them before publishing a stable
// release (stable releases are created as drafts for exactly that).
//
// The range starts at the newest earlier `v*` tag in the tag's history. A
// stable tag skips earlier prereleases, so 1.0.0 covers everything since the
// last stable release, not since its last release candidate. Pull requests
// come from GitHub (`gh api`, needs GH_TOKEN): the PRs each commit landed in.
import { execFile, execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const HEADER_RE = /^(\w+)(?:\(([^)]+)\))?(!)?: (.+)$/;

/** Section order. `type` lists the commit types that land in each. */
const SECTIONS = [
  { id: 'fixes', title: 'Bug Fixes', types: ['fix'] },
  { id: 'perf', title: 'Performance', types: ['perf'] },
  { id: 'a11y', title: 'Accessibility', types: [] },
  { id: 'hood', title: 'Under the Hood', types: ['refactor', 'build', 'ci', 'test', 'chore'] },
  { id: 'deps', title: 'Dependencies', types: [] },
];

/** Changes a reader of the notes does not need. */
const SKIPPED_TYPES = new Set(['docs', 'style', 'revert']);
const SKIPPED_SCOPES = new Set(['docs', 'spec', 'legacy']);

const A11Y_RE = /\b(a11y|accessib\w*|screen reader|aria|contrast|keyboard|focus)\b/i;

export function parseVersion(tag) {
  const m = SEMVER_RE.exec(tag);
  if (!m) return null;
  return { parts: [+m[1], +m[2], +m[3]], pre: m[4] ? m[4].split('.') : [] };
}

/** Semver precedence: negative when a < b. */
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) if (a.parts[i] !== b.parts[i]) return a.parts[i] - b.parts[i];
  if (!a.pre.length || !b.pre.length) return b.pre.length - a.pre.length;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i];
    const y = b.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny && +x !== +y) return +x - +y;
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** The tag the notes start from, or null for the first release. */
export function previousTag(tag, tags) {
  const current = parseVersion(tag);
  if (!current) throw new Error(`${tag} is not a semver tag`);
  const stable = current.pre.length === 0;
  let best = null;
  for (const candidate of tags) {
    if (candidate === tag || !candidate.startsWith('v')) continue;
    const version = parseVersion(candidate);
    if (!version || compareVersions(version, current) >= 0) continue;
    if (stable && version.pre.length > 0) continue;
    if (!best || compareVersions(version, best.version) > 0) best = { tag: candidate, version };
  }
  return best?.tag ?? null;
}

/** One commit subject as a conventional commit, or null when it is not one. */
export function parseCommit(subject) {
  const m = HEADER_RE.exec(subject.trim());
  if (!m) return null;
  return { type: m[1], scope: m[2] ?? null, breaking: Boolean(m[3]), summary: m[4] };
}

const sentence = text => text.charAt(0).toUpperCase() + text.slice(1);
/** Scopes that do not read as a capitalised word. */
const SCOPE_TITLES = { ui: 'Interface', '3d': '3D', tauri: 'Desktop shell' };
const scopeTitle = scope =>
  scope ? (SCOPE_TITLES[scope] ?? sentence(scope.replace(/[-_]/g, ' '))) : 'General';

/** Sorts parsed commits into the sections. Pure, for the self-test. */
export function groupCommits(commits) {
  const features = new Map();
  const sections = Object.fromEntries(SECTIONS.map(s => [s.id, []]));
  const breaking = [];
  for (const commit of commits) {
    if (SKIPPED_TYPES.has(commit.type) || SKIPPED_SCOPES.has(commit.scope)) continue;
    const line = sentence(commit.summary);
    if (commit.breaking) breaking.push(line);
    if (commit.scope === 'deps') sections.deps.push(line);
    else if (A11Y_RE.test(commit.summary) && ['feat', 'fix'].includes(commit.type)) {
      sections.a11y.push(line);
    } else if (commit.type === 'feat') {
      const title = scopeTitle(commit.scope);
      if (!features.has(title)) features.set(title, []);
      features.get(title).push(line);
    } else {
      const section = SECTIONS.find(s => s.types.includes(commit.type));
      if (section) sections[section.id].push(line);
    }
  }
  return { features, sections, breaking };
}

/** The notes as Markdown. Pure, for the self-test. */
export function renderNotes({ tag, previous, repo, grouped, pulls }) {
  const version = tag.replace(/^v/, '');
  const prerelease = parseVersion(tag)?.pre.length > 0;
  const { features, sections, breaking } = grouped;
  const featureCount = [...features.values()].reduce((n, list) => n + list.length, 0);
  const since = previous ? ` since ${previous.replace(/^v/, '')}` : '';
  const out = [];

  out.push(
    prerelease
      ? `A prerelease of KireiManga ${version} for testing. Installs of a prerelease update to the next one on their own.`
      : `KireiManga ${version} brings ${featureCount} new ${featureCount === 1 ? 'feature' : 'features'} and ${sections.fixes.length} ${sections.fixes.length === 1 ? 'fix' : 'fixes'}${since}.`
  );

  const highlights = [
    ...breaking.map(line => `**Breaking:** ${line}`),
    ...[...features.entries()].slice(0, 5).map(([title, list]) => `${title}: ${list[0]}`),
  ];
  if (highlights.length > 0) {
    out.push('', '## Highlights', '');
    out.push('<!-- Draft from the commits: rewrite before publishing a stable release. -->');
    out.push(...highlights.map(line => `- ${line}`));
  }

  if (features.size > 0) {
    out.push('', "## What's New");
    for (const [title, list] of features) {
      out.push('', `### ${title}`, '', ...list.map(line => `- ${line}`));
    }
  }

  for (const section of SECTIONS) {
    const list = sections[section.id];
    if (list.length === 0) continue;
    out.push('', `## ${section.title}`, '', ...list.map(line => `- ${line}`));
  }

  out.push('', '## Pull requests', '');
  if (pulls === null) out.push('- The pull request list could not be fetched for this release.');
  else if (pulls.length === 0) out.push('- No pull requests in this range.');
  else out.push(...pulls.map(pr => `- [#${pr.number}](${pr.url}) ${pr.title}`));

  out.push(
    '',
    previous
      ? `**Full changelog**: https://github.com/${repo}/compare/${previous}...${tag}`
      : `**Full changelog**: https://github.com/${repo}/commits/${tag}`
  );
  return `${out.join('\n')}\n`;
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/** Merged PRs the commits landed in, oldest first, or null when GitHub cannot be asked. */
async function fetchPulls(repo, shas) {
  const found = new Map();
  let failed = 0;
  const queue = [...shas];
  const worker = async () => {
    while (queue.length > 0) {
      const sha = queue.shift();
      try {
        const { stdout } = await run('gh', ['api', `repos/${repo}/commits/${sha}/pulls`], {
          maxBuffer: 16 * 1024 * 1024,
        });
        for (const pr of JSON.parse(stdout)) {
          if (pr.merged_at)
            found.set(pr.number, { number: pr.number, title: pr.title, url: pr.html_url });
        }
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  if (failed > 0 && found.size === 0) return null;
  if (failed > 0)
    console.warn(`::warning::${failed} commits could not be matched to a pull request`);
  return [...found.values()].sort((a, b) => a.number - b.number);
}

function selfTest() {
  const assert = (ok, message) => {
    if (!ok) throw new Error(`self-test: ${message}`);
  };
  const tags = [
    'v0.2.0',
    'v1.0.0-rc.1',
    'v1.0.0-rc.2',
    'v1.0.0',
    'v1.1.0-beta.1',
    'legacy-electron',
  ];
  assert(previousTag('v1.0.0', tags) === 'v0.2.0', 'stable skips release candidates');
  assert(previousTag('v1.0.0-rc.2', tags) === 'v1.0.0-rc.1', 'a prerelease follows the last tag');
  assert(previousTag('v1.1.0-beta.1', tags) === 'v1.0.0', 'beta after stable');
  assert(previousTag('v0.2.0', tags) === null, 'first release has no base');
  assert(
    compareVersions(parseVersion('v1.0.0-rc.10'), parseVersion('v1.0.0-rc.2')) > 0,
    'numeric prerelease parts compare as numbers'
  );

  const commits = [
    'feat(library): add the folder watcher',
    'feat(reader)!: drop the old page cache',
    'fix(ui): keep keyboard focus in the backup dialog',
    'fix(reader): stop a blank page after a resize',
    'perf(reader): decode pages ahead',
    'build(deps): bump zip to 9.1',
    'docs(reader): describe the adjust panel',
    'ci(actions): cache cargo',
    'not a conventional commit',
  ]
    .map(parseCommit)
    .filter(Boolean);
  const grouped = groupCommits(commits);
  assert(grouped.features.get('Library')?.length === 1, 'features grouped by scope');
  assert(grouped.sections.a11y.length === 1, 'accessibility fixes get their own section');
  assert(grouped.sections.fixes.length === 1, 'other fixes stay fixes');
  assert(grouped.sections.deps[0] === 'Bump zip to 9.1', 'deps section');
  assert(grouped.breaking.length === 1, 'breaking changes collected');

  const notes = renderNotes({
    tag: 'v1.0.0',
    previous: 'v0.2.0',
    repo: 'o/r',
    grouped,
    pulls: [{ number: 7, title: 'feat(library): watcher', url: 'https://github.com/o/r/pull/7' }],
  });
  const order = [
    '## Highlights',
    "## What's New",
    '## Bug Fixes',
    '## Performance',
    '## Accessibility',
    '## Under the Hood',
    '## Dependencies',
    '## Pull requests',
    '**Full changelog**: https://github.com/o/r/compare/v0.2.0...v1.0.0',
  ].map(heading => notes.indexOf(heading));
  assert(
    order.every((at, i) => at >= 0 && (i === 0 || at > order[i - 1])),
    `sections out of order:\n${notes}`
  );
  assert(notes.includes('- [#7](https://github.com/o/r/pull/7) feat(library): watcher'), 'PR line');
  assert(!/[\u2013\u2014]/.test(notes), 'no long dashes');
  console.log('release-notes self-test: OK');
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    args[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['self-test']) {
    selfTest();
    return;
  }
  for (const key of ['tag', 'repo', 'out']) {
    if (typeof args[key] !== 'string') {
      console.error(`Missing --${key}`);
      process.exit(1);
    }
  }
  const { tag, repo, out } = args;
  const tags = git('tag', '--list', 'v*', '--merged', tag).split('\n').filter(Boolean);
  const previous = previousTag(tag, tags);
  const range = previous ? `${previous}..${tag}` : tag;
  const log = git('log', '--no-merges', '--format=%H%x1f%s', range).split('\n').filter(Boolean);
  const entries = log.map(line => line.split('\x1f'));
  const commits = entries.map(([, subject]) => parseCommit(subject)).filter(Boolean);
  const pulls = await fetchPulls(
    repo,
    entries.map(([sha]) => sha)
  );
  const notes = renderNotes({ tag, previous, repo, grouped: groupCommits(commits), pulls });
  writeFileSync(out, notes);
  console.log(`Notes for ${tag} (${range}, ${entries.length} commits) written to ${out}`);
}

await main();
