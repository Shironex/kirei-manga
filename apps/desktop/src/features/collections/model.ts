import type { SeriesSummary } from '@/lib/library';
import {
  EMPTY_QUERY,
  type FilterQuery,
  type FilterSort,
  type ReadStatus,
  type ShelfItem,
  type ShelfOverview,
  type SourceFilter,
} from '@/lib/shelf';

import { languageName } from '../library/format';

/**
 * Pure helpers for the shelf screens: labels, query summaries, the split of
 * a list into local and remote series, reordering and pickers' states. Kept
 * apart from React so they are tested on their own.
 */

export const STATUS_OPTIONS: { value: ReadStatus; label: string }[] = [
  { value: 'unread', label: 'Unread' },
  { value: 'reading', label: 'Reading' },
  { value: 'finished', label: 'Finished' },
];

export const SORT_OPTIONS: { value: FilterSort; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'added', label: 'Date added' },
  { value: 'recent', label: 'Recently read' },
  { value: 'unread', label: 'Most unread' },
];

export const SOURCE_OPTIONS: { value: SourceFilter | 'any'; label: string }[] = [
  { value: 'any', label: 'Anywhere' },
  { value: 'local', label: 'On disk' },
  { value: 'mangadex', label: 'MangaDex' },
];

export const ADDED_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Any time' },
  { value: 7, label: 'Last 7 days' },
  { value: 30, label: 'Last 30 days' },
  { value: 90, label: 'Last 3 months' },
  { value: 365, label: 'Last year' },
];

/** How many covers a Home row shows before "See all". */
export const ROW_LIMIT = 18;

/** A saved query with every field present, whatever build saved it. */
export function completeQuery(query: Partial<FilterQuery>): FilterQuery {
  return { ...EMPTY_QUERY, ...query };
}

/** True when the query has no criterion, so it matches everything. */
export function isEmptyQuery(query: FilterQuery): boolean {
  return (
    query.tags.length === 0 &&
    query.excludeTags.length === 0 &&
    query.collections.length === 0 &&
    query.wantToRead === null &&
    query.status.length === 0 &&
    query.minUnread === null &&
    query.languages.length === 0 &&
    query.source === null &&
    query.addedWithinDays === null
  );
}

function names(ids: number[], from: { id: number; name: string }[]): string[] {
  return ids.map(id => from.find(x => x.id === id)?.name).filter((n): n is string => !!n);
}

function list(words: string[], joiner: 'or' | 'and'): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} ${joiner} ${words[words.length - 1]}`;
}

/**
 * A short plain sentence of what a filter keeps, such as
 * `Tagged Action or Drama, reading, at least 3 unread`. Tags and collections
 * that no longer exist are left out.
 */
export function describeQuery(
  query: FilterQuery,
  overview: Pick<ShelfOverview, 'tags' | 'collections'>
): string {
  const parts: string[] = [];
  const tags = names(query.tags, overview.tags);
  if (tags.length > 0) parts.push(`tagged ${list(tags, query.tagMode === 'all' ? 'and' : 'or')}`);
  const without = names(query.excludeTags, overview.tags);
  if (without.length > 0) parts.push(`not tagged ${list(without, 'or')}`);
  const collections = names(query.collections, overview.collections);
  if (collections.length > 0) parts.push(`in ${list(collections, 'or')}`);
  if (query.wantToRead === true) parts.push('in Want to Read');
  if (query.wantToRead === false) parts.push('not in Want to Read');
  if (query.status.length > 0 && query.status.length < STATUS_OPTIONS.length) {
    const labels = STATUS_OPTIONS.filter(s => query.status.includes(s.value)).map(s =>
      s.label.toLowerCase()
    );
    parts.push(list(labels, 'or'));
  }
  if (query.minUnread !== null) {
    parts.push(`at least ${query.minUnread} unread`);
  }
  if (query.languages.length > 0) {
    parts.push(
      list(
        query.languages.map(l => languageName(l) ?? l),
        'or'
      )
    );
  }
  if (query.source === 'local') parts.push('on disk');
  if (query.source === 'mangadex') parts.push('from MangaDex');
  if (query.addedWithinDays !== null) {
    const added = ADDED_OPTIONS.find(o => o.value === query.addedWithinDays);
    parts.push(
      `added ${added ? added.label.toLowerCase() : `in the last ${query.addedWithinDays} days`}`
    );
  }
  if (parts.length === 0) return 'Every series';
  const sentence = parts.join(', ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** A list split into what the catalogue draws and what only a source knows. */
export interface ResolvedItems {
  /** Local series in list order, as the catalogue has them now. */
  local: SeriesSummary[];
  /** Titles that are not on disk. */
  remote: ShelfItem[];
}

/**
 * Splits list items into local series (looked up in the catalogue, dropping
 * any it no longer has) and remote titles, both in list order.
 */
export function resolveItems(
  items: readonly ShelfItem[],
  byId: ReadonlyMap<number, SeriesSummary>
): ResolvedItems {
  const local: SeriesSummary[] = [];
  const remote: ShelfItem[] = [];
  for (const item of items) {
    if (item.seriesId !== null) {
      const series = byId.get(item.seriesId);
      if (series) local.push(series);
    } else {
      remote.push(item);
    }
  }
  return { local, remote };
}

/** A copy of `items` with the one at `from` moved to `to` (clamped). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const out = [...items];
  if (from < 0 || from >= out.length) return out;
  const target = Math.max(0, Math.min(out.length - 1, to));
  const [moved] = out.splice(from, 1);
  if (moved !== undefined) out.splice(target, 0, moved);
  return out;
}

export type Coverage = 'all' | 'some' | 'none';

/** Whether every, some or none of a selection of `size` carries something. */
export function coverage(count: number, size: number): Coverage {
  if (count <= 0 || size <= 0) return 'none';
  return count >= size ? 'all' : 'some';
}

/** The noun phrase for a number of series: `1 series`, `12 series`. */
export function seriesCount(n: number): string {
  return `${n.toLocaleString('en')} series`;
}
