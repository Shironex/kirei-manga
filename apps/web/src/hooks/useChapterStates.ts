import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LibraryEvents,
  type LibraryChapterStatePatch,
  type LibraryGetChapterStatesPayload,
  type LibraryGetChapterStatesResponse,
  type LibraryUpdatedEvent,
} from '@kireimanga/shared';
import { emitWithResponse, getSocket } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

export type ChapterStatesMap = Record<string, LibraryChapterStatePatch>;

/**
 * Fetches the read-state of the given chapters for a followed series and
 * keeps it in sync by patching in place whenever a progress-changed broadcast
 * arrives. Returns `null` until a snapshot has actually landed (so callers
 * can render an unread placeholder in the meantime).
 */
export function useChapterStates(
  localSeriesId: string | null,
  chapterIds: string[]
): ChapterStatesMap | null {
  const status = useSocketStore(s => s.status);

  // Stable key so we don't refetch on every re-render of the chapter array.
  const joinedKey = useMemo(() => chapterIds.join(','), [chapterIds]);

  const [states, setStates] = useState<ChapterStatesMap | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Dedup stale in-flight requests.
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!localSeriesId || chapterIds.length === 0) {
      setStates(null);
      return;
    }
    if (status !== 'connected') return;
    const rid = ++requestIdRef.current;
    void (async () => {
      try {
        const payload: LibraryGetChapterStatesPayload = {
          seriesId: localSeriesId,
          chapterIds,
        };
        const res = await emitWithResponse<
          LibraryGetChapterStatesPayload,
          LibraryGetChapterStatesResponse
        >(LibraryEvents.GET_CHAPTER_STATES, payload);
        if (!mountedRef.current) return;
        if (rid !== requestIdRef.current) return;
        if (res.error) {
          // Non-fatal: leave previous states; caller falls back to placeholder.
          return;
        }
        setStates(res.states ?? {});
      } catch {
        // Swallow — stale snapshot is better than flashing to loading.
      }
    })();
  }, [localSeriesId, joinedKey, status]);

  // Patch in place whenever the backend reports progress on one of our chapters.
  useEffect(() => {
    const socket = getSocket();
    const handler = (payload: LibraryUpdatedEvent) => {
      if (payload.action === 'downloads-cleared') {
        // Global reset — the page-cache folder was wiped, so every mangadex
        // chapter's `isDownloaded` flag is stale. Drop it on the whole map
        // so the UI renders the "not downloaded" affordance immediately.
        setStates(prev => {
          if (!prev) return prev;
          const next: ChapterStatesMap = {};
          for (const [id, state] of Object.entries(prev)) {
            next[id] = { ...state, isDownloaded: false };
          }
          return next;
        });
        return;
      }
      if (payload.action !== 'progress-changed') return;
      const chapter = payload.chapter;
      if (!chapter) return;
      setStates(prev => {
        if (!prev) return prev;
        if (!(chapter.mangadexChapterId in prev)) return prev;
        return {
          ...prev,
          [chapter.mangadexChapterId]: {
            isRead: chapter.isRead,
            lastReadPage: chapter.lastReadPage,
            pageCount: chapter.pageCount,
            isDownloaded: prev[chapter.mangadexChapterId]?.isDownloaded ?? false,
          },
        };
      });
    };
    socket.on(LibraryEvents.UPDATED, handler);
    return () => {
      socket.off(LibraryEvents.UPDATED, handler);
    };
  }, []);

  return states;
}
