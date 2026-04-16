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
  const status = useSocketStore(s => s.status);
  const key = cacheKey(filters);

  const cached = feedCache.get(key);
  const [results, setResults] = useState<SearchResult[]>(() => cached?.results ?? []);
  const [total, setTotal] = useState<number | null>(() => cached?.total ?? null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPage = useCallback(
    async (f: SearchFilters, offset: number, append: boolean, rid: number) => {
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
          query: '',
          filters: { ...f, limit: PAGE_SIZE, offset },
        };
        const response = await emitWithResponse<MangaDexSearchPayload, MangaDexSearchResponse>(
          MangaDexEvents.SEARCH,
          payload,
        );
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        if (response.error) {
          setError(response.error);
          if (!append) setResults([]);
          return;
        }
        const entries = response.results ?? [];
        const nextTotal = response.total ?? entries.length;
        setResults(prev => {
          const next = append ? [...prev, ...entries] : entries;
          feedCache.set(cacheKey(f), { results: next, total: nextTotal });
          return next;
        });
        setTotal(nextTotal);
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
    [status],
  );

  useEffect(() => {
    if (!enabled) return;
    const hit = feedCache.get(key);
    if (hit) {
      setResults(hit.results);
      setTotal(hit.total);
      setLoading(false);
      setError(null);
      return;
    }
    const rid = ++requestIdRef.current;
    setResults([]);
    setTotal(null);
    void fetchPage(filters, 0, false, rid);
  }, [key, enabled, fetchPage, nonce, filters]);

  const loadMore = useCallback(() => {
    if (!enabled) return;
    if (loading || loadingMore) return;
    if (total === null) return;
    const offset = results.length;
    if (offset >= total) return;
    if (offset + PAGE_SIZE > MAX_OFFSET_PLUS_LIMIT) return;
    const rid = ++requestIdRef.current;
    void fetchPage(filters, offset, true, rid);
  }, [enabled, loading, loadingMore, total, results.length, filters, fetchPage]);

  const retry = useCallback(() => {
    feedCache.delete(key);
    setNonce(n => n + 1);
  }, [key]);

  const hasMore =
    total !== null && results.length < total && results.length + PAGE_SIZE <= MAX_OFFSET_PLUS_LIMIT;

  return { results, total, loading, loadingMore, error, hasMore, loadMore, retry };
}
