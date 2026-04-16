import { useCallback, useMemo } from 'react';
import {
  MangaDexEvents,
  type MangaDexSearchPayload,
  type MangaDexSearchResponse,
  type SearchFilters,
  type SearchResult,
} from '@kireimanga/shared';
import { useSocketPagedQuery } from './useSocketQuery';

const PAGE_SIZE = 24;
const MAX_OFFSET_PLUS_LIMIT = 10000;

interface HookState {
  results: SearchResult[];
  total: number | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  retry: () => void;
}

interface CacheEntry {
  results: SearchResult[];
  total: number;
}

const feedCache = new Map<string, CacheEntry>();

function cacheKey(filters: SearchFilters): string {
  return JSON.stringify(filters);
}

export function useMangaDexFeed(filters: SearchFilters, enabled: boolean): HookState {
  const key = cacheKey(filters);

  const buildPayload = useCallback(
    (offset: number): MangaDexSearchPayload => ({
      query: '',
      filters: { ...filters, limit: PAGE_SIZE, offset },
    }),
    [filters]
  );

  const selectItems = useCallback(
    (r: MangaDexSearchResponse): SearchResult[] => r.results ?? [],
    []
  );
  const selectTotal = useCallback(
    (r: MangaDexSearchResponse, items: SearchResult[]): number => r.total ?? items.length,
    []
  );

  const initial = useMemo(() => {
    const hit = feedCache.get(key);
    return hit ? { results: hit.results, total: hit.total } : null;
  }, [key]);

  const onReplace = useCallback(
    (items: SearchResult[], total: number) => {
      feedCache.set(key, { results: items, total });
    },
    [key]
  );

  const onAppend = useCallback(
    (items: SearchResult[], total: number) => {
      feedCache.set(key, { results: items, total });
    },
    [key]
  );

  const onRetry = useCallback(() => {
    feedCache.delete(key);
  }, [key]);

  return useSocketPagedQuery<MangaDexSearchPayload, MangaDexSearchResponse, SearchResult>({
    event: MangaDexEvents.SEARCH,
    buildPayload,
    selectItems,
    selectTotal,
    pageSize: PAGE_SIZE,
    maxOffsetPlusLimit: MAX_OFFSET_PLUS_LIMIT,
    resetKey: key,
    disabled: !enabled,
    initial,
    onReplace,
    onAppend,
    onRetry,
  });
}
