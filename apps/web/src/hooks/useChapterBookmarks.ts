import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChapterEvents,
  LibraryEvents,
  createLogger,
  type BookmarkWithChapter,
  type ChapterAddBookmarkPayload,
  type ChapterAddBookmarkResponse,
  type ChapterGetBookmarksPayload,
  type ChapterGetBookmarksResponse,
  type ChapterRemoveBookmarkPayload,
  type ChapterRemoveBookmarkResponse,
  type LibraryUpdatedEvent,
} from '@kireimanga/shared';
import { emitWithResponse, getSocket } from '@/lib/socket';
import { useSocketStore } from '@/stores/socket-store';

const logger = createLogger('useChapterBookmarks');

/**
 * Chapter-scoped bookmark state for the reader. Returns the bookmark list for
 * the current chapter plus a fire-and-forget `toggle(page)` that adds or
 * removes a bookmark based on whether one already exists at that page. UI
 * updates are driven by the `library:updated` broadcast so the series panel
 * and the reader stay in sync without optimistic plumbing.
 */
export function useChapterBookmarks(
  mangadexSeriesId: string | null,
  mangadexChapterId: string | null
): {
  bookmarks: BookmarkWithChapter[];
  isPageBookmarked: (page: number) => boolean;
  toggle: (page: number) => Promise<void>;
} {
  const status = useSocketStore(s => s.status);
  const [bookmarks, setBookmarks] = useState<BookmarkWithChapter[]>([]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestIdRef = useRef(0);

  // Fetch the series' bookmarks and filter to the current chapter.
  useEffect(() => {
    if (!mangadexSeriesId || !mangadexChapterId) {
      setBookmarks([]);
      return;
    }
    if (status !== 'connected') return;
    const rid = ++requestIdRef.current;
    void (async () => {
      try {
        const res = await emitWithResponse<
          ChapterGetBookmarksPayload,
          ChapterGetBookmarksResponse
        >(ChapterEvents.GET_BOOKMARKS, { mangadexSeriesId });
        if (!mountedRef.current) return;
        if (rid !== requestIdRef.current) return;
        if (res.error) {
          logger.warn('chapter:get-bookmarks returned error', res.error);
          return;
        }
        const filtered = (res.bookmarks ?? []).filter(
          b => b.mangadexChapterId === mangadexChapterId
        );
        setBookmarks(filtered);
      } catch (err) {
        logger.warn('chapter:get-bookmarks failed', err);
      }
    })();
  }, [mangadexSeriesId, mangadexChapterId, status]);

  // Subscribe to library:updated for add/remove broadcasts.
  useEffect(() => {
    if (!mangadexChapterId) return;
    const socket = getSocket();
    const handler = (payload: LibraryUpdatedEvent) => {
      if (payload.action === 'bookmark-added') {
        if (!payload.bookmark) return;
        if (payload.bookmark.mangadexChapterId !== mangadexChapterId) return;
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
  }, [mangadexChapterId]);

  const bookmarkByPage = useMemo(() => {
    const map = new Map<number, BookmarkWithChapter>();
    for (const b of bookmarks) map.set(b.page, b);
    return map;
  }, [bookmarks]);

  const isPageBookmarked = useCallback(
    (page: number) => bookmarkByPage.has(page),
    [bookmarkByPage]
  );

  const toggle = useCallback(
    async (page: number) => {
      if (!mangadexSeriesId || !mangadexChapterId) return;
      const existing = bookmarkByPage.get(page);
      try {
        if (existing) {
          await emitWithResponse<
            ChapterRemoveBookmarkPayload,
            ChapterRemoveBookmarkResponse
          >(ChapterEvents.REMOVE_BOOKMARK, { bookmarkId: existing.id });
        } else {
          await emitWithResponse<
            ChapterAddBookmarkPayload,
            ChapterAddBookmarkResponse
          >(ChapterEvents.ADD_BOOKMARK, {
            mangadexSeriesId,
            mangadexChapterId,
            page,
          });
        }
      } catch (err) {
        logger.warn('bookmark toggle failed', err);
      }
    },
    [mangadexSeriesId, mangadexChapterId, bookmarkByPage]
  );

  return { bookmarks, isPageBookmarked, toggle };
}
