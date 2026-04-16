import { useCallback, useEffect, useMemo, useState } from 'react';
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

interface Options {
  debounceMs?: number;
  minLength?: number;
}

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

export function useMangaDexSearch(
  query: string,
  filters?: SearchFilters,
  options: Options = {}
): HookState {
  const { debounceMs = 250, minLength = 2 } = options;
  const trimmed = query.trim();
  const enabled = trimmed.length >= minLength;

  const [debounced, setDebounced] = useState(() => ({ query: trimmed, filters }));

  useEffect(() => {
    if (!enabled) {
      setDebounced({ query: trimmed, filters });
      return;
    }
    const handle = setTimeout(() => {
      setDebounced({ query: trimmed, filters });
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [trimmed, filters, enabled, debounceMs]);

  const buildPayload = useCallback(
    (offset: number): MangaDexSearchPayload => ({
      query: debounced.query,
      filters: { ...(debounced.filters ?? {}), limit: PAGE_SIZE, offset },
    }),
    [debounced]
  );

  const selectItems = useCallback(
    (r: MangaDexSearchResponse): SearchResult[] => r.results ?? [],
    []
  );
  const selectTotal = useCallback(
    (r: MangaDexSearchResponse, items: SearchResult[]): number => r.total ?? items.length,
    []
  );

  const resetKey = useMemo(
    () => JSON.stringify({ q: debounced.query, f: debounced.filters }),
    [debounced]
  );

  return useSocketPagedQuery<MangaDexSearchPayload, MangaDexSearchResponse, SearchResult>({
    event: MangaDexEvents.SEARCH,
    buildPayload,
    selectItems,
    selectTotal,
    pageSize: PAGE_SIZE,
    maxOffsetPlusLimit: MAX_OFFSET_PLUS_LIMIT,
    resetKey,
    disabled: !enabled,
    resetWhenDisabled: true,
  });
}
