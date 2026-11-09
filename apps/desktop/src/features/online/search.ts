import type { Demographic, PublicationStatus, SearchOrder, SearchQuery } from '@/lib/online';

/** Results per search page. */
export const PAGE_SIZE = 30;

export type TagState = 'include' | 'exclude';

export interface Filters {
  title: string;
  status: PublicationStatus[];
  demographic: Demographic[];
  tags: Record<string, TagState>;
  order: SearchOrder | 'auto';
  anyLanguage: boolean;
}

export const EMPTY_FILTERS: Filters = {
  title: '',
  status: [],
  demographic: [],
  tags: {},
  order: 'auto',
  anyLanguage: false,
};

/** The search request for a set of filters, from the first result on. */
export function toQuery(filters: Filters, offset = 0): SearchQuery {
  const title = filters.title.trim();
  const order = filters.order === 'auto' ? null : filters.order;
  return {
    title: title || null,
    status: filters.status,
    demographic: filters.demographic,
    includedTags: Object.keys(filters.tags).filter(id => filters.tags[id] === 'include'),
    excludedTags: Object.keys(filters.tags).filter(id => filters.tags[id] === 'exclude'),
    languages: filters.anyLanguage ? { kind: 'any' } : { kind: 'preferences' },
    order: order ? [order, order === 'title' ? 'asc' : 'desc'] : null,
    limit: PAGE_SIZE,
    offset,
  };
}

export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value];
}

/** Off, then include, then exclude, then off. */
export function nextTagState(current: TagState | undefined): TagState | undefined {
  if (!current) return 'include';
  return current === 'include' ? 'exclude' : undefined;
}
