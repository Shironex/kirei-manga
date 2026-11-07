import type { SeriesSummary } from '@/lib/library';

/**
 * The library grid's filter, search and sort, as pure functions over the
 * series list the core returns. Kept apart from React so they are tested on
 * their own and stay cheap enough to rerun on every keystroke over 10k series.
 */

export type ShelfFilter = 'all' | 'reading' | 'unread' | 'finished';
export type ShelfSort = 'recent' | 'title' | 'added' | 'new';
export type ReadingState = 'reading' | 'unread' | 'finished';

export const FILTERS: { value: ShelfFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reading', label: 'Reading' },
  { value: 'unread', label: 'Unread' },
  { value: 'finished', label: 'Finished' },
];

export const SORTS: { value: ShelfSort; label: string }[] = [
  { value: 'recent', label: 'Recently read' },
  { value: 'title', label: 'Title' },
  { value: 'added', label: 'Date added' },
  { value: 'new', label: 'New chapters' },
];

export function readingState(series: SeriesSummary): ReadingState {
  if (series.chapterCount > 0 && series.completedCount >= series.chapterCount) return 'finished';
  if (series.completedCount === 0 && series.lastReadAt === null) return 'unread';
  return 'reading';
}

/** Share of chapters finished, 0 to 1. */
export function seriesProgress(series: SeriesSummary): number {
  return series.chapterCount > 0 ? Math.min(1, series.completedCount / series.chapterCount) : 0;
}

// Letters NFD does not split into a base letter and a mark.
const FOLDS: Record<string, string> = { ł: 'l', đ: 'd', ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe' };

/**
 * Lower case without diacritics, so "zolta lodz" finds "Żółta łódź" and
 * "kori" finds "Kōri". NFD splits most accented letters; the rest are mapped.
 */
export function foldText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łđøßæœ]/g, ch => FOLDS[ch] ?? ch);
}

/** Every word of the query appears somewhere in the title, in any order. */
export function matchesQuery(foldedTitle: string, foldedQuery: string): boolean {
  return foldedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every(word => foldedTitle.includes(word));
}

// Polish rules put "Ł" after "L" and "Ż" after "Z"; numeric keeps "Vol 2" before "Vol 10".
const collator = new Intl.Collator('pl', { sensitivity: 'base', numeric: true });

export function compareTitles(a: SeriesSummary, b: SeriesSummary): number {
  return collator.compare(a.title, b.title) || a.id - b.id;
}

const COMPARE: Record<ShelfSort, (a: SeriesSummary, b: SeriesSummary) => number> = {
  recent: (a, b) => (b.lastReadAt ?? -1) - (a.lastReadAt ?? -1) || compareTitles(a, b),
  title: compareTitles,
  added: (a, b) => b.addedAt - a.addedAt || compareTitles(a, b),
  new: (a, b) =>
    b.newCount - a.newCount ||
    b.chapterCount - b.completedCount - (a.chapterCount - a.completedCount) ||
    compareTitles(a, b),
};

export interface ShelfQuery {
  filter: ShelfFilter;
  sort: ShelfSort;
  search: string;
}

/** Filtered, searched and sorted copy of `series`. */
export function shelve(series: SeriesSummary[], query: ShelfQuery): SeriesSummary[] {
  const folded = foldText(query.search.trim());
  return series
    .filter(s => query.filter === 'all' || readingState(s) === query.filter)
    .filter(s => !folded || matchesQuery(foldText(s.title), folded))
    .sort(COMPARE[query.sort]);
}

/**
 * The continue-reading hero and the "also reading" list: series in progress,
 * most recently read first. With nothing in progress the hero offers the
 * newest unread series instead, so a fresh library still opens on a cover.
 */
export function continueShelf(series: SeriesSummary[]): {
  hero: SeriesSummary | null;
  mode: 'continue' | 'start';
  also: SeriesSummary[];
} {
  const reading = series
    .filter(s => readingState(s) === 'reading' && s.continueChapterId !== null && !s.missing)
    .sort(COMPARE.recent);
  if (reading.length > 0) {
    return { hero: reading[0] ?? null, mode: 'continue', also: reading.slice(1, 4) };
  }
  const fresh = series
    .filter(s => readingState(s) === 'unread' && s.continueChapterId !== null && !s.missing)
    .sort(COMPARE.added);
  return { hero: fresh[0] ?? null, mode: 'start', also: [] };
}
