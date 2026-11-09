import type { NavPath } from '@/app/shell/useShortcuts';

import type { Searchable } from './fuzzy';

/** The groups of results, in the order the palette lists them. */
export type PaletteSection =
  'recent' | 'series' | 'chapters' | 'pages' | 'settings' | 'actions' | 'online';

export const SECTION_LABELS: Record<PaletteSection, string> = {
  recent: 'Recent',
  series: 'Series',
  chapters: 'Chapters',
  pages: 'Go to',
  settings: 'Settings',
  actions: 'Actions',
  online: 'Online',
};

export const SECTION_ORDER: readonly PaletteSection[] = [
  'recent',
  'series',
  'chapters',
  'pages',
  'settings',
  'actions',
  'online',
];

/** Everything a target may need to run; supplied by the palette host. */
export interface PaletteContext {
  goTo: (to: NavPath) => void;
  goToSeries: (seriesId: number) => void;
  openChapter: (seriesId: number, chapterId: number) => void;
  close: () => void;
}

/** What Enter does. A custom target brings its own behaviour (online sources use it). */
export type PaletteTarget =
  | { type: 'series'; seriesId: number }
  | { type: 'chapter'; seriesId: number; chapterId: number }
  | { type: 'page'; to: NavPath }
  | { type: 'section'; section: string }
  | { type: 'action'; action: PaletteActionId }
  | { type: 'custom'; run: (ctx: PaletteContext) => void | Promise<void> };

export type PaletteActionId =
  | 'rescan'
  | 'add-folder'
  | 'toggle-cover-colours'
  | 'toggle-ambient'
  | 'toggle-glass'
  | 'backup'
  | 'open-data-folder';

export interface PaletteItem {
  /** Stable across sessions for everything but custom targets: `series:12`, `action:rescan`. */
  id: string;
  /** Which group the item belongs to when found by a search. */
  section: Exclude<PaletteSection, 'recent'>;
  title: string;
  subtitle?: string;
  /** Shortcut keys shown on the right, such as `['Ctrl', ',']`. */
  keys?: string[];
  target: PaletteTarget;
}

/** An item with its text folded once, so a keystroke only scores. */
export interface IndexEntry {
  item: PaletteItem;
  text: Searchable;
}

/**
 * Extension point for results that do not live in the app's own data. The
 * online lane (#43) registers a source with `section: 'online'` whose items
 * carry `{ type: 'custom' }` targets. The palette calls `search` after a
 * short pause on every query of two or more characters, aborts it when the
 * query moves on, and shows what comes back under the source's label. A
 * source that throws is skipped; it never blocks the local results.
 */
export interface PaletteSource {
  id: string;
  /** Heading of the group; defaults to the section label. */
  label?: string;
  section: Extract<PaletteSection, 'online'>;
  search: (query: string, signal: AbortSignal) => Promise<PaletteItem[]>;
}
