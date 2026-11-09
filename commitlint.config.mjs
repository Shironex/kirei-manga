/**
 * Commitlint config, Conventional Commits.
 * Used by .husky/commit-msg and mirrored for PR titles in pr-title-lint.yml.
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 100],
    // Every commit carries a scope from this list, for example `feat(core): ...`.
    // Add a scope here in the same commit that introduces the area it names.
    'scope-empty': [2, 'never'],
    'scope-enum': [
      2,
      'always',
      [
        // Rust crates
        'core',
        'archive',
        'reader',
        'library',
        // Desktop app
        'desktop',
        'ui',
        'tauri',
        'updater',
        // Repo and tooling
        'workspace',
        'rust',
        'deps',
        'actions',
        'release',
        'docker',
        // Other areas
        'landing',
        'docs',
        'spec',
        'legacy',
        'assets',
        '3d',
        'design',
        'stats',
      ],
    ],
    'subject-case': [2, 'never', ['sentence-case', 'pascal-case', 'upper-case', 'start-case']],
  },
};
