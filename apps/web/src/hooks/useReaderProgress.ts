import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReaderEvents,
  type ReaderSessionEndPayload,
  type ReaderSessionEndResponse,
  type ReaderSessionStartPayload,
  type ReaderSessionStartResponse,
  type ReaderUpdateProgressPayload,
  type ReaderUpdateProgressResponse,
} from '@kireimanga/shared';
import { emitWithResponse } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';
import { useToastStore } from '@/stores/toast-store';
import { useT } from '@/hooks/useT';

const PROGRESS_DEBOUNCE_MS = 750;

interface UseReaderProgressArgs {
  mangadexSeriesId: string | null;
  mangadexChapterId: string | null;
  pageCount: number;
  pageIndex: number;
  chapterMeta?: {
    chapterNumber?: number;
    volumeNumber?: number;
    title?: string;
  };
}

interface UseReaderProgressResult {
  startPage: number | null;
}

/**
 * Wires the reader view into the progress + session event stream.
 *
 * Lifecycle per mount (strict-mode safe via refs):
 *  1. Once the socket is connected and both ids are present, emit
 *     `reader:session-start`. Remember the returned `sessionId` and
 *     `startPage` so the caller can resume to the correct page.
 *  2. On every `pageIndex` change, debounce 750ms then emit
 *     `reader:update-progress` with the full payload.
 *  3. On unmount, flush any pending progress debounce and, if a session
 *     actually started, emit `reader:session-end` with the final page and
 *     elapsed duration.
 */
export function useReaderProgress(args: UseReaderProgressArgs): UseReaderProgressResult {
  const { mangadexSeriesId, mangadexChapterId, pageCount, pageIndex, chapterMeta } = args;

  const status = useSocketStore(s => s.status);
  const showToast = useToastStore(s => s.show);
  const t = useT();

  const [startPage, setStartPage] = useState<number | null>(null);

  // Refs so nested callbacks see the latest values without retriggering effects.
  const sessionIdRef = useRef<string | null>(null);
  const sessionStartedAtRef = useRef<number | null>(null);
  const sessionAttemptedRef = useRef(false);
  const lastPageRef = useRef<number>(pageIndex);
  lastPageRef.current = pageIndex;

  const pageCountRef = useRef<number>(pageCount);
  pageCountRef.current = pageCount;

  const seriesIdRef = useRef<string | null>(mangadexSeriesId);
  seriesIdRef.current = mangadexSeriesId;
  const chapterIdRef = useRef<string | null>(mangadexChapterId);
  chapterIdRef.current = mangadexChapterId;
  const metaRef = useRef(chapterMeta);
  metaRef.current = chapterMeta;
  // Held in a ref so the unmount cleanup effect doesn't re-run (and prematurely
  // fire session-end) when the user switches language mid-read.
  const tRef = useRef(t);
  tRef.current = t;

  // Debounced progress writer.
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
    const meta = metaRef.current;
    try {
      const payload: ReaderUpdateProgressPayload = {
        mangadexSeriesId: seriesId,
        mangadexChapterId: chapterId,
        page,
        pageCount: total,
        chapterNumber: meta?.chapterNumber,
        volumeNumber: meta?.volumeNumber,
        title: meta?.title,
      };
      const res = await emitWithResponse<ReaderUpdateProgressPayload, ReaderUpdateProgressResponse>(
        ReaderEvents.UPDATE_PROGRESS,
        payload
      );
      if (res.error) {
        showToast({ variant: 'error', title: tRef.current('reader.toast.progressTitle'), body: res.error });
      }
    } catch (err) {
      showToast({
        variant: 'error',
        title: tRef.current('reader.toast.progressTitle'),
        body: err instanceof Error ? err.message : String(err),
      });
    }
  }, [showToast]);

  // Kick off a session exactly once per mount, once both ids + socket are ready.
  useEffect(() => {
    if (sessionAttemptedRef.current) return;
    if (status !== 'connected') return;
    if (!mangadexSeriesId || !mangadexChapterId) return;
    sessionAttemptedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const payload: ReaderSessionStartPayload = {
          mangadexSeriesId,
          mangadexChapterId,
        };
        const res = await emitWithResponse<ReaderSessionStartPayload, ReaderSessionStartResponse>(
          ReaderEvents.SESSION_START,
          payload
        );
        if (cancelled) return;
        if (res.error) {
          showToast({ variant: 'error', title: tRef.current('reader.toast.sessionTitle'), body: res.error });
          return;
        }
        sessionIdRef.current = res.sessionId;
        sessionStartedAtRef.current = Date.now();
        setStartPage(res.startPage);
      } catch (err) {
        if (cancelled) return;
        showToast({
          variant: 'error',
          title: tRef.current('reader.toast.sessionTitle'),
          body: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, mangadexSeriesId, mangadexChapterId, showToast]);

  // Debounce progress emits whenever the page index changes.
  useEffect(() => {
    if (!mangadexSeriesId || !mangadexChapterId) return;
    if (pageCount <= 0) return;
    pendingPageRef.current = pageIndex;
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => {
      void flushProgress();
    }, PROGRESS_DEBOUNCE_MS);
  }, [pageIndex, pageCount, mangadexSeriesId, mangadexChapterId, flushProgress]);

  // Flush pending progress + end the session on unmount.
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearTimeout(progressTimerRef.current);
        progressTimerRef.current = null;
        void flushProgress();
      }
      const sessionId = sessionIdRef.current;
      const startedAt = sessionStartedAtRef.current;
      if (sessionId && startedAt !== null) {
        const payload: ReaderSessionEndPayload = {
          sessionId,
          endPage: lastPageRef.current,
          durationMs: Date.now() - startedAt,
        };
        sessionIdRef.current = null;
        sessionStartedAtRef.current = null;
        void (async () => {
          try {
            const res = await emitWithResponse<ReaderSessionEndPayload, ReaderSessionEndResponse>(
              ReaderEvents.SESSION_END,
              payload
            );
            if (res.error) {
              showToast({ variant: 'error', title: tRef.current('reader.toast.sessionTitle'), body: res.error });
            }
          } catch {
            // Unmount path — swallow; toast host may already be gone.
          }
        })();
      }
    };
  }, [flushProgress, showToast]);

  return { startPage };
}
