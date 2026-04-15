import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MangaDexEvents,
  type MangaDexGetSeriesPayload,
  type MangaDexGetSeriesResponse,
  type MangaDexSeriesDetail,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

interface HookState {
  series: MangaDexSeriesDetail | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Fetch a MangaDex series detail over the socket bridge. Mirrors
 * `useMangaDexSearch`'s stale-response / cleanup pattern.
 */
export function useMangaDexSeries(mangadexId: string | undefined): HookState {
  const status = useSocketStore(s => s.status);

  const [series, setSeries] = useState<MangaDexSeriesDetail | null>(null);
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
    async (id: string, rid: number) => {
      if (status !== 'connected') {
        setError('Disconnected');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload: MangaDexGetSeriesPayload = { mangadexId: id };
        const response = await emitWithResponse<
          MangaDexGetSeriesPayload,
          MangaDexGetSeriesResponse
        >(MangaDexEvents.GET_SERIES, payload);
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        if (response.error) {
          setError(response.error);
          setSeries(null);
        } else {
          setSeries(response.series);
        }
      } catch (err) {
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setSeries(null);
      } finally {
        if (mountedRef.current && rid === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [status]
  );

  useEffect(() => {
    if (!mangadexId) {
      requestIdRef.current += 1;
      setSeries(null);
      setLoading(false);
      setError(null);
      return;
    }
    const rid = ++requestIdRef.current;
    void run(mangadexId, rid);
  }, [mangadexId, run, nonce, status]);

  const retry = useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  return { series, loading, error, retry };
}
