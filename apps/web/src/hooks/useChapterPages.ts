import { useEffect, useRef, useState, useCallback } from 'react';
import {
  LocalEvents,
  MangaDexEvents,
  type LocalGetPagesPayload,
  type LocalGetPagesResponse,
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

export type ChapterSource = 'mangadex' | 'local';

/**
 * Route the page-list fetch to the right channel for the given source.
 * Returns `kirei-page://...` proxy URLs either way — the reader doesn't
 * need to know which backend served them.
 */
async function fetchPages(id: string, source: ChapterSource): Promise<string[]> {
  if (source === 'local') {
    const response = await emitWithResponse<LocalGetPagesPayload, LocalGetPagesResponse>(
      LocalEvents.GET_PAGES,
      { localChapterId: id }
    );
    if (response.error) throw new Error(response.error);
    return response.pages;
  }
  const response = await emitWithResponse<MangaDexGetPagesPayload, MangaDexGetPagesResponse>(
    MangaDexEvents.GET_PAGES,
    { chapterId: id }
  );
  if (response.error) throw new Error(response.error);
  return response.pages;
}

/**
 * Fetch the page URL list for a chapter over the socket bridge. Mirrors
 * `useMangaDexSeries`'s stale-response / cleanup pattern. Each returned URL is
 * a `kirei-page://...` proxy address served by the desktop main process.
 *
 * `source` decides which channel carries the request — MangaDex chapter
 * ids route to `mangadex:get-pages`; local chapter ids (UUIDs from the
 * SQLite `chapters.id` column) route to `local:get-pages`.
 */
export function useChapterPages(
  chapterId: string | undefined,
  source: ChapterSource = 'mangadex'
): HookState {
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
        const fetched = await fetchPages(id, source);
        if (!mountedRef.current || rid !== requestIdRef.current) return;
        setPages(fetched);
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
    [status, source]
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
