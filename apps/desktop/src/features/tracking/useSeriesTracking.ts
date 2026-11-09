import { useCallback, useEffect, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import {
  getSeriesTracking,
  onTrackingChanged,
  type SeriesRef,
  type SeriesTracking,
} from '@/lib/tracking';

/**
 * Tracking state of one series. Refetches on `tracking:changed` (a delivery,
 * a link, the account) and when `version` moves (a library scan). The setter
 * takes the state a command returned, so the card updates without a refetch.
 */
export function useSeriesTracking(series: SeriesRef, version: number) {
  const [state, setState] = useState<SeriesTracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const kind = series.kind;
  const id = series.id;

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setState(await getSeriesTracking({ kind, id } as SeriesRef));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [kind, id]);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let live = true;
    void onTrackingChanged(() => void refresh()).then(stop => {
      if (live) unlisten = stop;
      else stop();
    });
    return () => {
      live = false;
      unlisten?.();
    };
  }, [refresh]);

  return { state, setState, error, setError, refresh };
}
