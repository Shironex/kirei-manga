import { useCallback, useMemo } from 'react';
import {
  MangaDexEvents,
  type MangaDexGetChaptersPayload,
  type MangaDexGetChaptersResponse,
  type ChapterListItem,
} from '@kireimanga/shared';
import { useSocketQuery } from './useSocketQuery';

interface HookState {
  chapters: ChapterListItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

const EMPTY: ChapterListItem[] = [];

export function useMangaDexChapters(
  mangadexId: string | undefined,
  lang: string | undefined
): HookState {
  const payload = useMemo<MangaDexGetChaptersPayload | null>(
    () => (mangadexId ? { mangadexId, lang } : null),
    [mangadexId, lang]
  );

  const select = useCallback(
    (r: MangaDexGetChaptersResponse): ChapterListItem[] => r.chapters ?? EMPTY,
    []
  );

  const { data, loading, error, retry } = useSocketQuery<
    MangaDexGetChaptersPayload,
    MangaDexGetChaptersResponse,
    ChapterListItem[]
  >({
    event: MangaDexEvents.GET_CHAPTERS,
    payload,
    select,
    initialData: EMPTY,
  });

  return { chapters: data, loading, error, retry };
}
