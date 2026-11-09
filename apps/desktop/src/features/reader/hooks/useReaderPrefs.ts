import { useCallback, useRef, useState } from 'react';

import {
  chosenMode,
  directionFromComicInfo,
  prefsFromSettings,
  startMode,
  type ReaderPrefs,
} from '../model/prefs';
import type { PageSize } from '../model/spreads';
import type { LoadedChapter } from '../useChapter';
import type { SettingsWriter } from './useSeriesSettings';

/**
 * The prefs a chapter opens with. A library series reads its own `reader`
 * entry in the series settings, starting from the app defaults with the
 * direction from ComicInfo. The mode is the series' own choice when it made
 * one; otherwise a chapter of tall strips opens in webtoon (with detection
 * on) and the rest in the default mode. A file starts from the defaults.
 */
export function initialPrefs(
  chapter: Pick<LoadedChapter, 'seriesId' | 'settings' | 'manga'> & {
    pages: readonly PageSize[];
  },
  defaults: ReaderPrefs,
  detectWebtoon: boolean
): { prefs: ReaderPrefs; modeChosen: boolean } {
  const { seriesId, settings, manga, pages } = chapter;
  const chosen = seriesId === null ? null : chosenMode(settings, defaults.mode);
  const base =
    seriesId === null
      ? defaults
      : prefsFromSettings(settings, {
          ...defaults,
          direction: directionFromComicInfo(manga, defaults.direction),
        });
  const mode = startMode({ chosen, appDefault: defaults.mode, detectWebtoon, pages });
  return { prefs: { ...base, mode }, modeChosen: chosen !== null };
}

/**
 * Reader prefs for the open chapter (see `initialPrefs`). A library series
 * writes its `reader` entry on every change, with `modeChosen` set once the
 * reader picks a mode, so detection stops overriding it for that series. A
 * file keeps changes for the session: the app defaults change only in
 * Settings.
 */
export function useReaderPrefs(
  chapter: LoadedChapter,
  defaults: ReaderPrefs,
  write: SettingsWriter,
  detectWebtoon: boolean
): [ReaderPrefs, (patch: Partial<ReaderPrefs>) => void] {
  const [initial] = useState(() => initialPrefs(chapter, defaults, detectWebtoon));
  const [prefs, setPrefs] = useState<ReaderPrefs>(initial.prefs);
  const current = useRef(prefs);
  const modeChosen = useRef(initial.modeChosen);

  const update = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      const next = { ...current.current, ...patch };
      current.current = next;
      if (patch.mode !== undefined) modeChosen.current = true;
      setPrefs(next);
      write('reader', { ...next, modeChosen: modeChosen.current });
    },
    [write]
  );

  return [prefs, update];
}
