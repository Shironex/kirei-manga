import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MangaDexEvents,
  type MangaDexSearchPayload,
  type MangaDexSearchResponse,
  type SearchFilters,
  type SearchResult,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

interface Options {
  /** Debounce delay before firing a search (ms). Default 250. */
  debounceMs?: number;
  /** Minimum query length before we hit the network. Default 2. */
  minLength?: number;
}

interface HookState {
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Debounced MangaDex search over the socket bridge. Drops stale responses
 * using a monotonic request id and aborts gracefully on unmount.
 */
export function useMangaDexSearch(
  query: string,
  filters?: SearchFilters,
  options: Options = {}
): HookState {
  const { debounceMs = 250, minLength = 2 } = options;
  const status = useSocketStore(s => s.status);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
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

  const run = useCallback(
    async (q: string, f: SearchFilters | undefined, rid: number) => {
      if (status !== 'connected') {
        setError('Disconnected');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload: MangaDexSearchPayload = { query: q, filters: f };
        const response = await emitWithResponse<MangaDexSearchPayload, MangaDexSearchResponse>(
          MangaDexEvents.SEARCH,
          payload
        );
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        if (response.error) {
          setError(response.error);
          setResults([]);
        } else {
          setResults(response.results ?? []);
        }
      } catch (err) {
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setResults([]);
      } finally {
        if (mountedRef.current && rid === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [status]
  );

  useEffect(() => {
    const trimmed = query.trim();
    // Below threshold: clear results, don't bother the backend.
    if (trimmed.length < minLength) {
      requestIdRef.current += 1;
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const rid = ++requestIdRef.current;
    const handle = setTimeout(() => {
      void run(trimmed, filters, rid);
    }, debounceMs);

    return () => clearTimeout(handle);
    // filters is a potentially-unstable reference; callers memoize upstream.
  }, [query, filters, debounceMs, minLength, run, nonce]);

  const retry = useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  return { results, loading, error, retry };
}
