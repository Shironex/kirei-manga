import { useEffect, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import { getReadingStats, type ReadingStats } from '@/lib/stats';

export type StatsState =
  | { status: 'loading' }
  | { status: 'ready'; stats: ReadingStats }
  | { status: 'error'; message: string }
  | { status: 'unavailable' };

/**
 * Loads the stats of `year` (the current year when null). Keeps the previous
 * year on screen while the next loads, so switching years does not flash.
 */
export function useStats(year: number | null): StatsState {
  const [state, setState] = useState<StatsState>(() =>
    isTauri() ? { status: 'loading' } : { status: 'unavailable' }
  );
  const target = year ?? new Date().getFullYear();

  useEffect(() => {
    if (!isTauri()) return;
    let live = true;
    getReadingStats(target).then(
      stats => live && setState({ status: 'ready', stats }),
      (error: unknown) =>
        live &&
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
    );
    return () => {
      live = false;
    };
  }, [target]);

  return state;
}
