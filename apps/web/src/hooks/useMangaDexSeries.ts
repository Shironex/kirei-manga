import { useCallback, useMemo } from 'react';
import {
  MangaDexEvents,
  type MangaDexGetSeriesPayload,
  type MangaDexGetSeriesResponse,
  type MangaDexSeriesDetail,
} from '@kireimanga/shared';
import { useSocketQuery } from './useSocketQuery';

interface HookState {
  series: MangaDexSeriesDetail | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

export function useMangaDexSeries(mangadexId: string | undefined): HookState {
  const payload = useMemo<MangaDexGetSeriesPayload | null>(
    () => (mangadexId ? { mangadexId } : null),
    [mangadexId]
  );

  const select = useCallback(
    (r: MangaDexGetSeriesResponse): MangaDexSeriesDetail | null => r.series,
    []
  );

  const { data, loading, error, retry } = useSocketQuery<
    MangaDexGetSeriesPayload,
    MangaDexGetSeriesResponse,
    MangaDexSeriesDetail | null
  >({
    event: MangaDexEvents.GET_SERIES,
    payload,
    select,
    initialData: null,
  });

  return { series: data, loading, error, retry };
}
