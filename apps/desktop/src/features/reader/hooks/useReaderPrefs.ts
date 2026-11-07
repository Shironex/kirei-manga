import { useCallback, useRef, useState } from 'react';

import { directionFromComicInfo, prefsFromSettings, type ReaderPrefs } from '../model/prefs';
import type { LoadedChapter } from '../useChapter';
import type { SettingsWriter } from './useSeriesSettings';

/**
 * Reader prefs for the open chapter. A library series reads and writes its own
 * `reader` entry in the series settings, starting from the app defaults with
 * the direction from ComicInfo. A file starts from the defaults and keeps
 * changes for the session: the app defaults change only in Settings.
 */
export function useReaderPrefs(
  chapter: LoadedChapter,
  defaults: ReaderPrefs,
  write: SettingsWriter
): [ReaderPrefs, (patch: Partial<ReaderPrefs>) => void] {
  const { seriesId, settings, manga } = chapter;
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => {
    if (seriesId === null) return defaults;
    const fallback = { ...defaults, direction: directionFromComicInfo(manga, defaults.direction) };
    return prefsFromSettings(settings, fallback);
  });
  const current = useRef(prefs);

  const update = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      const next = { ...current.current, ...patch };
      current.current = next;
      setPrefs(next);
      write('reader', next);
    },
    [write]
  );

  return [prefs, update];
}
