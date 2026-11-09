import { NAV_SHORTCUTS } from '@/app/shell/useShortcuts';
import { chapterLabel, type SeriesDetail, type SeriesSummary } from '@/lib/library';

import { prepare, queryWords, scoreSearchable } from './fuzzy';
import type { IndexEntry, PaletteItem, PaletteSection } from './types';

/**
 * What the palette can find. Series are indexed from the library store and
 * memoised on the array the store hands out, so typing never rebuilds it and
 * a rescan rebuilds it once. Chapters are indexed per series on demand (the
 * catalogue has no cheap list of every chapter). Pages, settings and actions
 * are fixed.
 */

const entry = (item: PaletteItem, extra = ''): IndexEntry => ({
  item,
  text: prepare(item.title, extra),
});

const PAGES: [path: keyof typeof NAV_SHORTCUTS, title: string, extra: string][] = [
  ['/library', 'Library', 'home shelf series'],
  ['/browse', 'Browse', 'online mangadex discover'],
  ['/downloads', 'Downloads', 'queue offline'],
  ['/stats', 'Reading stats', 'streak heatmap year in review hours history'],
  ['/settings', 'Settings', 'preferences options'],
];

/** Sections of the Settings screen. Ids match `SECTIONS` in `SettingsPage`. */
const SETTINGS: [section: string, title: string, extra: string][] = [
  ['appearance', 'Appearance', 'theme colour strength glass motion ambient'],
  ['reader', 'Reader settings', 'mode direction fit filter spreads page'],
  ['library', 'Library settings', 'folders roots scan covers cache orphans progress'],
  ['data', 'Data and backup', 'backup restore export import data folder portable'],
  ['shortcuts', 'Keyboard shortcuts', 'keys hotkeys keybindings'],
  ['about', 'About', 'version updates licence notices'],
  ['appearance', 'Cover colours', 'tint accent theme'],
  ['appearance', 'Theme strength', 'subtle balanced vivid'],
  ['appearance', 'Reduce motion', 'animation transitions'],
  ['reader', 'Reading direction', 'rtl ltr right to left'],
  ['reader', 'Page fit', 'screen width height original zoom'],
  ['library', 'Cover cache', 'thumbnails clear prune'],
  ['about', 'Check for updates', 'upgrade release version'],
];

const ACTIONS: [
  action: Extract<PaletteItem['target'], { type: 'action' }>['action'],
  title: string,
  extra: string,
][] = [
  ['rescan', 'Rescan library', 'refresh scan folders update'],
  ['add-folder', 'Add a folder of manga', 'root import library scan'],
  ['toggle-cover-colours', 'Toggle cover colours', 'tint accent theme appearance'],
  ['toggle-ambient', 'Toggle ambient glow', 'cover glow background appearance'],
  ['toggle-glass', 'Toggle glass panels', 'transparency blur appearance'],
  ['backup', 'Back up or restore data', 'backup restore export data'],
  ['open-data-folder', 'Open data folder', 'show finder explorer files'],
];

const STATIC_ENTRIES: IndexEntry[] = [
  ...PAGES.map(([to, title, extra]) =>
    entry({ id: `page:${to}`, section: 'pages', title, target: { type: 'page', to } }, extra)
  ),
  ...SETTINGS.map(([section, title, extra]) =>
    entry(
      {
        id: `setting:${section}:${title}`,
        section: 'settings',
        title,
        subtitle: 'Settings',
        target: { type: 'section', section },
      },
      extra
    )
  ),
  ...ACTIONS.map(([action, title, extra]) =>
    entry(
      { id: `action:${action}`, section: 'actions', title, target: { type: 'action', action } },
      extra
    )
  ),
];

/** Pages, settings and actions with their keys filled in by the caller's platform. */
export function staticEntries(
  keysFor: (path: keyof typeof NAV_SHORTCUTS) => string[]
): IndexEntry[] {
  return STATIC_ENTRIES.map(e =>
    e.item.target.type === 'page'
      ? { ...e, item: { ...e.item, keys: keysFor(e.item.target.to) } }
      : e
  );
}

const seriesIndexes = new WeakMap<readonly SeriesSummary[], IndexEntry[]>();

/** One entry per series, memoised on the array identity. */
export function seriesEntries(series: readonly SeriesSummary[]): IndexEntry[] {
  let built = seriesIndexes.get(series);
  if (!built) {
    built = series.map(s =>
      entry({
        id: `series:${s.id}`,
        section: 'series',
        title: s.title,
        subtitle: `${s.chapterCount} ${s.chapterCount === 1 ? 'chapter' : 'chapters'}`,
        target: { type: 'series', seriesId: s.id },
      })
    );
    seriesIndexes.set(series, built);
  }
  return built;
}

/** Entries for the readable chapters of one series. The series title also finds them. */
export function chapterEntries(
  detail: Pick<SeriesDetail, 'id' | 'title' | 'chapters'>
): IndexEntry[] {
  return detail.chapters
    .filter(c => !c.missing)
    .map(c => {
      const label = chapterLabel(c);
      const title = c.title && label !== c.title ? `${label} ${c.title}` : label;
      return entry(
        {
          id: `chapter:${c.id}`,
          section: 'chapters',
          title,
          subtitle: detail.title,
          target: { type: 'chapter', seriesId: detail.id, chapterId: c.id },
        },
        detail.title
      );
    });
}

export interface Scored {
  item: PaletteItem;
  score: number;
}

/** The best `limit` entries for a query, best first. Ties keep the index order. */
export function searchEntries(
  entries: readonly IndexEntry[],
  query: string,
  limit: number
): Scored[] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  const hits: Scored[] = [];
  for (const { item, text } of entries) {
    const score = scoreSearchable(words, text);
    if (score >= 0) hits.push({ item, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.length > limit ? hits.slice(0, limit) : hits;
}

/** How many results each group shows for a typed query. */
export const SECTION_LIMITS: Record<Exclude<PaletteSection, 'recent'>, number> = {
  series: 8,
  chapters: 6,
  pages: 3,
  settings: 5,
  actions: 5,
  online: 6,
};
