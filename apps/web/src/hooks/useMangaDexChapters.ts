import { useEffect, useRef, useState, useCallback } from 'react';
import {
  MangaDexEvents,
  type MangaDexGetChaptersPayload,
  type MangaDexGetChaptersResponse,
  type ChapterListItem,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

interface HookState {
  chapters: ChapterListItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/**
 * Fetch the chapter list for a MangaDex series, optionally filtered by
 * translated language. Mirrors `useMangaDexSearch`'s staleness guard.
 */
export function useMangaDexChapters(
  mangadexId: string | undefined,
  lang: string | undefined
): HookState {
  const status = useSocketStore(s => s.status);

  const [chapters, setChapters] = useState<ChapterListItem[]>([]);
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
    async (id: string, l: string | undefined, rid: number) => {
      if (status !== 'connected') {
        setError('Disconnected');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const payload: MangaDexGetChaptersPayload = { mangadexId: id, lang: l };
        const response = await emitWithResponse<
          MangaDexGetChaptersPayload,
          MangaDexGetChaptersResponse
        >(MangaDexEvents.GET_CHAPTERS, payload);
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        if (response.error) {
          setError(response.error);
          setChapters([]);
        } else {
          setChapters(response.chapters ?? []);
        }
      } catch (err) {
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setChapters([]);
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
      setChapters([]);
      setLoading(false);
      setError(null);
      return;
    }
    const rid = ++requestIdRef.current;
    void run(mangadexId, lang, rid);
  }, [mangadexId, lang, run, nonce, status]);

  const retry = useCallback(() => {
    setNonce(n => n + 1);
  }, []);

  return { chapters, loading, error, retry };
}
