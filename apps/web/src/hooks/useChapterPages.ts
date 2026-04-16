import { useCallback, useMemo } from 'react';
import {
  LocalEvents,
  MangaDexEvents,
  type LocalGetPagesPayload,
  type LocalGetPagesResponse,
  type MangaDexGetPagesPayload,
  type MangaDexGetPagesResponse,
} from '@kireimanga/shared';
import { useSocketQuery } from './useSocketQuery';

interface HookState {
  pages: string[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export type ChapterSource = 'mangadex' | 'local';

type PagesPayload = MangaDexGetPagesPayload | LocalGetPagesPayload;
type PagesResponse = MangaDexGetPagesResponse | LocalGetPagesResponse;

const EMPTY: string[] = [];

/**
 * Fetch the page URL list for a chapter. Each returned URL is a
 * `kirei-page://...` proxy address served by the desktop main process.
 *
 * `source` decides which channel carries the request — MangaDex chapter
 * ids route to `mangadex:get-pages`; local chapter ids (UUIDs from the
 * SQLite `chapters.id` column) route to `local:get-pages`.
 */
export function useChapterPages(
  chapterId: string | undefined,
  source: ChapterSource = 'mangadex'
): HookState {
  const event = source === 'local' ? LocalEvents.GET_PAGES : MangaDexEvents.GET_PAGES;

  const payload = useMemo<PagesPayload | null>(() => {
    if (!chapterId) return null;
    return source === 'local' ? { localChapterId: chapterId } : { chapterId };
  }, [chapterId, source]);

  const select = useCallback((r: PagesResponse): string[] => r.pages ?? EMPTY, []);

  const { data, loading, error, retry } = useSocketQuery<
    PagesPayload,
    PagesResponse,
    string[]
  >({
    event,
    payload,
    select,
    initialData: EMPTY,
  });

  return { pages: data, loading, error, retry };
}
