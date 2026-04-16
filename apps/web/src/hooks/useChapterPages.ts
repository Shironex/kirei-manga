import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MangaDexEvents,
  type MangaDexGetPagesPayload,
  type MangaDexGetPagesResponse,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

interface HookState {
  pages: string[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Fetch the page URL list for a chapter over the socket bridge. Mirrors
 * `useMangaDexSeries`'s stale-response / cleanup pattern. Each returned URL is
 * a `kirei-page://...` proxy address served by the desktop main process.
 */
export function useChapterPages(chapterId: string | undefined): HookState {
  const status = useSocketStore(s => s.status);

  const [pages, setPages] = useState<string[]>([]);
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
        const payload: MangaDexGetPagesPayload = { chapterId: id };
        const response = await emitWithResponse<
          MangaDexGetPagesPayload,
          MangaDexGetPagesResponse
        >(MangaDexEvents.GET_PAGES, payload);
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        if (response.error) {
          setError(response.error);
          setPages([]);
        } else {
          setPages(response.pages);
        }
      } catch (err) {
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setPages([]);
      } finally {
        if (mountedRef.current && rid === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [status]
  );

  useEffect(() => {
    if (!chapterId) {
      requestIdRef.current += 1;
      setPages([]);
      setLoading(false);
      setError(null);
      return;
    }
    const rid = ++requestIdRef.current;
    void run(chapterId, rid);
  }, [chapterId, run, nonce, status]);

  const retry = useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  return { pages, loading, error, retry };
}
