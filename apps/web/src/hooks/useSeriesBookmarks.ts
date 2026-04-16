import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChapterEvents,
  LibraryEvents,
  createLogger,
  type BookmarkWithChapter,
  type ChapterGetBookmarksPayload,
  type ChapterGetBookmarksResponse,
  type ChapterRemoveBookmarkPayload,
  type ChapterRemoveBookmarkResponse,
  type LibraryUpdatedEvent,
} from '@kireimanga/shared';
import { emitWithResponse, getSocket } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

const logger = createLogger('useSeriesBookmarks');

/**
 * Series-scoped bookmark list for the series detail page. Returns the full
 * bookmark list for the series and a `remove(bookmarkId)` action; updates are
 * driven by the `library:updated` broadcast so the reader and panel stay in
 * sync without optimistic logic. Skips fetch when the series isn't actually
 * in the local library yet (mangadexId null or pending follow).
 */
export function useSeriesBookmarks(mangadexSeriesId: string | null): {
  bookmarks: BookmarkWithChapter[];
  loading: boolean;
  error: string | null;
  remove: (bookmarkId: string) => Promise<void>;
} {
  const status = useSocketStore(s => s.status);
  const [bookmarks, setBookmarks] = useState<BookmarkWithChapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!mangadexSeriesId) {
      setBookmarks([]);
      setLoading(false);
      setError(null);
      return;
    }
    if (status !== 'connected') return;
    const rid = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await emitWithResponse<ChapterGetBookmarksPayload, ChapterGetBookmarksResponse>(
          ChapterEvents.GET_BOOKMARKS,
          { mangadexSeriesId }
        );
        if (!mountedRef.current) return;
        if (rid !== requestIdRef.current) return;
        if (res.error) {
          setError(res.error);
          setLoading(false);
          return;
        }
        setBookmarks(res.bookmarks ?? []);
        setLoading(false);
      } catch (err) {
        if (!mountedRef.current) return;
        if (rid !== requestIdRef.current) return;
        const message = err instanceof Error ? err.message : String(err);
        logger.warn('chapter:get-bookmarks failed', message);
        setError(message);
        setLoading(false);
      }
    })();
  }, [mangadexSeriesId, status]);

  // Patch in place from broadcasts.
  useEffect(() => {
    if (!mangadexSeriesId) return;
    const socket = getSocket();
    const handler = (payload: LibraryUpdatedEvent) => {
      if (payload.action === 'bookmark-added') {
        if (!payload.bookmark) return;
        if (payload.bookmark.mangadexSeriesId !== mangadexSeriesId) return;
        setBookmarks(prev => {
          if (prev.some(b => b.id === payload.bookmark!.id)) return prev;
          return [...prev, payload.bookmark!];
        });
        return;
      }
      if (payload.action === 'bookmark-removed') {
        if (!payload.bookmarkId) return;
        setBookmarks(prev => prev.filter(b => b.id !== payload.bookmarkId));
        return;
      }
    };
    socket.on(LibraryEvents.UPDATED, handler);
    return () => {
      socket.off(LibraryEvents.UPDATED, handler);
    };
  }, [mangadexSeriesId]);

  const remove = useCallback(async (bookmarkId: string) => {
    try {
      await emitWithResponse<ChapterRemoveBookmarkPayload, ChapterRemoveBookmarkResponse>(
        ChapterEvents.REMOVE_BOOKMARK,
        { bookmarkId }
      );
    } catch (err) {
      logger.warn('chapter:remove-bookmark failed', err);
    }
  }, []);

  return { bookmarks, loading, error, remove };
}
