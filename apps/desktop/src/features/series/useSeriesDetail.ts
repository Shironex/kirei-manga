import { useEffect, useState } from 'react';

import { getSeriesDetail, type SeriesDetail } from '@/lib/library';

import { useLibrary } from '../library/libraryStore';

export type DetailState =
  | { status: 'loading'; detail: null; error: null }
  | { status: 'ready'; detail: SeriesDetail | null; error: null }
  | { status: 'error'; detail: null; error: string };

/**
 * One series with its chapters. Refetches when the id changes and after a
 * scan (the library version moves), keeping the old detail on screen while
 * the new one loads so the page never blanks.
 */
export function useSeriesDetail(id: number | null): DetailState {
  const { version } = useLibrary();
  const [state, setState] = useState<DetailState>({
    status: 'loading',
    detail: null,
    error: null,
  });

  useEffect(() => {
    if (id === null) {
      setState({ status: 'ready', detail: null, error: null });
      return;
    }
    let live = true;
    getSeriesDetail(id).then(
      detail => live && setState({ status: 'ready', detail, error: null }),
      (error: unknown) =>
        live &&
        setState({
          status: 'error',
          detail: null,
          error: error instanceof Error ? error.message : String(error),
        })
    );
    return () => {
      live = false;
    };
  }, [id, version]);

  return state;
}
