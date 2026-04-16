/**
 * English string dictionary (default).
 *
 * Keep keys flat and namespaced by surface (`nav.*`, `topbar.*`, `library.*`,
 * `settings.*`, `toast.*`). Interpolation uses `{name}` placeholders resolved
 * by `useT()` — see `apps/web/src/hooks/useT.ts`.
 *
 * Coverage in v0.1 is intentionally partial — Sidebar, TopBar, Library page,
 * Toast eyebrows, and the Settings shell are migrated. Browse, SeriesBanner,
 * ChapterList, and Reader chrome are scheduled for a follow-up
 * `chore(web): complete i18n pass` after v0.1 ships.
 */
export const en = {
  // Navigation
  'nav.library': 'Library',
  'nav.browse': 'Browse',
  'nav.settings': 'Settings',
  'nav.footer': 'v0.1 · draft',

  // TopBar
  'topbar.placeholder.library': 'Filter library…',
  'topbar.placeholder.global': 'Search library or MangaDex…',
  'topbar.status.offline': 'Offline',

  // Library page
  'library.eyebrow': 'Library',
  'library.title': 'Your shelf, quiet and kept.',
  'library.subtitle.count': '{count} series',
  'library.empty.title': 'No series followed yet.',
  'library.empty.body': 'Start by browsing MangaDex to find your first series.',
  'library.empty.cta': 'Browse MangaDex',
  'library.empty.cta.import': 'Import local',
  'library.empty.hint': 'Ctrl + B · Browse',
  'library.filters.empty': 'No series match your filters.',

  // Settings
  'settings.eyebrow': 'Settings',
  'settings.title': 'Everything, tuned to you.',
  'settings.section.appearance': 'Appearance',
  'settings.section.reader': 'Reader',
  'settings.section.library': 'Library',
  'settings.section.keyboard': 'Keyboard',
  'settings.language.label': 'Language',
  'settings.language.option.en': 'English',
  'settings.language.option.pl': 'Polski',

  // Toast
  'toast.eyebrow.error': 'ERROR',
  'toast.eyebrow.notice': 'NOTICE',
  'toast.eyebrow.done': 'DONE',
  'toast.dismiss': 'Dismiss',
} as const;
