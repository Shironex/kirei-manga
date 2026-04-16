import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MangaDexEvents,
  type MangaDexSearchPayload,
  type MangaDexSearchResponse,
  type SearchFilters,
  type SearchResult,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

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
  const status = useSocketStore(s => s.status);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  const lastFetchRef = useRef<{ query: string; filters: SearchFilters | undefined } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPage = useCallback(
    async (
      q: string,
      f: SearchFilters | undefined,
      offset: number,
      append: boolean,
      rid: number
    ) => {
      if (status !== 'connected') {
        setError('Disconnected');
        if (append) setLoadingMore(false);
        else setLoading(false);
        return;
      }
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const payload: MangaDexSearchPayload = {
          query: q,
          filters: { ...(f ?? {}), limit: PAGE_SIZE, offset },
        };
        const response = await emitWithResponse<MangaDexSearchPayload, MangaDexSearchResponse>(
          MangaDexEvents.SEARCH,
          payload
        );
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        if (response.error) {
          setError(response.error);
          if (!append) setResults([]);
          return;
        }
        const entries = response.results ?? [];
        setResults(prev => (append ? [...prev, ...entries] : entries));
        setTotal(response.total ?? entries.length);
        lastFetchRef.current = { query: q, filters: f };
      } catch (err) {
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        if (!append) setResults([]);
      } finally {
        if (mountedRef.current && rid === requestIdRef.current) {
          if (append) setLoadingMore(false);
          else setLoading(false);
        }
      }
    },
    [status]
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < minLength) {
      requestIdRef.current += 1;
      setResults([]);
      setTotal(null);
      setLoading(false);
      setError(null);
      lastFetchRef.current = null;
      return;
    }

    const rid = ++requestIdRef.current;
    const handle = setTimeout(() => {
      void fetchPage(trimmed, filters, 0, false, rid);
    }, debounceMs);

    return () => clearTimeout(handle);
  }, [query, filters, debounceMs, minLength, fetchPage, nonce]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore) return;
    if (total === null) return;
    const last = lastFetchRef.current;
    if (!last) return;
    const offset = results.length;
    if (offset >= total) return;
    if (offset + PAGE_SIZE > MAX_OFFSET_PLUS_LIMIT) return;
    const rid = ++requestIdRef.current;
    void fetchPage(last.query, last.filters, offset, true, rid);
  }, [loading, loadingMore, total, results.length, fetchPage]);

  const retry = useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  const hasMore =
    total !== null && results.length < total && results.length + PAGE_SIZE <= MAX_OFFSET_PLUS_LIMIT;

  return { results, total, loading, loadingMore, error, hasMore, loadMore, retry };
}
