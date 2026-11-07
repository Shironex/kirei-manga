import { useCallback, useEffect, useRef } from 'react';

import { setSeriesSettings } from '@/lib/library';

import { mergeSettings } from '../model/prefs';

/** Writes are batched so dragging through options costs one write. */
const SAVE_DELAY_MS = 400;

export type SettingsWriter = (key: string, value: unknown) => void;

/**
 * One writer for a series' settings object, shared by every reader feature
 * that keeps something there (`reader` prefs, image `adjust`ments). Each
 * writes its own key into the same object, so no feature overwrites another's
 * entry with a stale copy. Does nothing for a chapter opened from a file.
 */
export function useSeriesSettings(seriesId: number | null, initial: unknown): SettingsWriter {
  const stored = useRef<unknown>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef(false);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (!pending.current || seriesId === null) return;
    pending.current = false;
    setSeriesSettings(seriesId, stored.current).catch(() => {
      // Kept for this session; the next change tries again.
    });
  }, [seriesId]);

  // Leaving the reader saves what is still waiting.
  useEffect(() => flush, [flush]);

  return useCallback(
    (key, value) => {
      if (seriesId === null) return;
      stored.current = mergeSettings(stored.current, key, value);
      pending.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [seriesId, flush]
  );
}
