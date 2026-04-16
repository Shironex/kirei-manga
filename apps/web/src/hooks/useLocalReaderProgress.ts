import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReaderEvents,
  type ReaderGetLocalResumePayload,
  type ReaderGetLocalResumeResponse,
  type ReaderUpdateLocalProgressPayload,
  type ReaderUpdateLocalProgressResponse,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';
import { useToastStore } from '@/stores/toast-store';

const PROGRESS_DEBOUNCE_MS = 750;

interface UseLocalReaderProgressArgs {
  localSeriesId: string | null;
  localChapterId: string | null;
  pageCount: number;
  pageIndex: number;
}

interface UseLocalReaderProgressResult {
  startPage: number | null;
}

/**
 * Local-source counterpart to `useReaderProgress`. Fetches the resume
 * page on mount and debounces progress writes on every page change. No
 * session lifecycle (reading_sessions is mangadex-only for now) — a
 * future slice can add it if the stats feature needs local sessions.
 */
export function useLocalReaderProgress(
  args: UseLocalReaderProgressArgs
): UseLocalReaderProgressResult {
  const { localSeriesId, localChapterId, pageCount, pageIndex } = args;

  const status = useSocketStore(s => s.status);
  const showToast = useToastStore(s => s.show);

  const [startPage, setStartPage] = useState<number | null>(null);
  const resumeFetchedRef = useRef(false);

  const seriesIdRef = useRef<string | null>(localSeriesId);
  seriesIdRef.current = localSeriesId;
  const chapterIdRef = useRef<string | null>(localChapterId);
  chapterIdRef.current = localChapterId;
  const pageCountRef = useRef<number>(pageCount);
  pageCountRef.current = pageCount;

  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPageRef = useRef<number | null>(null);

  const flushProgress = useCallback(async () => {
    progressTimerRef.current = null;
    const page = pendingPageRef.current;
    pendingPageRef.current = null;
    if (page === null) return;
    const seriesId = seriesIdRef.current;
    const chapterId = chapterIdRef.current;
    const total = pageCountRef.current;
    if (!seriesId || !chapterId || total <= 0) return;
    try {
      const payload: ReaderUpdateLocalProgressPayload = {
        localSeriesId: seriesId,
        localChapterId: chapterId,
        page,
        pageCount: total,
      };
      const res = await emitWithResponse<
        ReaderUpdateLocalProgressPayload,
        ReaderUpdateLocalProgressResponse
      >(ReaderEvents.UPDATE_LOCAL_PROGRESS, payload);
      if (res.error) {
        showToast({ variant: 'error', title: 'Reader progress', body: res.error });
      }
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Reader progress',
        body: err instanceof Error ? err.message : String(err),
      });
    }
  }, [showToast]);

  // Fetch the resume page exactly once per chapter once the socket is up.
  useEffect(() => {
    if (resumeFetchedRef.current) return;
    if (status !== 'connected') return;
    if (!localChapterId) return;
    resumeFetchedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const payload: ReaderGetLocalResumePayload = { localChapterId };
        const res = await emitWithResponse<
          ReaderGetLocalResumePayload,
          ReaderGetLocalResumeResponse
        >(ReaderEvents.GET_LOCAL_RESUME, payload);
        if (cancelled) return;
        if (res.error) {
          setStartPage(0);
          return;
        }
        setStartPage(res.startPage);
      } catch {
        if (cancelled) return;
        setStartPage(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, localChapterId]);

  // Reset the resume-fetch latch when the chapter changes so the next
  // navigation triggers a fresh lookup.
  useEffect(() => {
    resumeFetchedRef.current = false;
    setStartPage(null);
  }, [localChapterId]);

  // Debounce progress emits whenever the page index changes.
  useEffect(() => {
    if (!localSeriesId || !localChapterId) return;
    if (pageCount <= 0) return;
    pendingPageRef.current = pageIndex;
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      void flushProgress();
    }, PROGRESS_DEBOUNCE_MS);
  }, [pageIndex, pageCount, localSeriesId, localChapterId, flushProgress]);

  // Flush pending progress on unmount so the last page number never gets lost.
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
        void flushProgress();
      }
    };
  }, [flushProgress]);

  return { startPage };
}
