import { useCallback, useRef, useState } from 'react';

import { adjustmentsFromSettings, type Adjustments } from '../model/adjust';
import type { LoadedChapter } from '../useChapter';
import type { SettingsWriter } from './useSeriesSettings';

export interface AdjustState {
  adjustments: Adjustments;
  /** Saved in the series settings under `adjust`. Always false for a file. */
  remember: boolean;
  update: (patch: Partial<Adjustments>) => void;
  setRemember: (remember: boolean) => void;
  reset: () => void;
}

/**
 * Image adjustments for the open chapter. A library series starts from what
 * it saved under `adjust` and keeps saving while "Remember for this series"
 * is on; turning it off stores `null`, so the next chapter opens neutral. A
 * file keeps adjustments for the session.
 */
export function useAdjustments(
  chapter: LoadedChapter,
  defaults: Adjustments,
  write: SettingsWriter
): AdjustState {
  const library = chapter.seriesId !== null;
  const [state, setState] = useState(() =>
    library
      ? adjustmentsFromSettings(chapter.settings, defaults)
      : { adjustments: defaults, remember: false }
  );
  const current = useRef(state);

  const commit = useCallback(
    (next: { adjustments: Adjustments; remember: boolean }) => {
      current.current = next;
      setState(next);
      write('adjust', next.remember ? next.adjustments : null);
    },
    [write]
  );

  const update = useCallback(
    (patch: Partial<Adjustments>) =>
      commit({ ...current.current, adjustments: { ...current.current.adjustments, ...patch } }),
    [commit]
  );
  const setRemember = useCallback(
    (remember: boolean) => commit({ ...current.current, remember: library && remember }),
    [commit, library]
  );
  const reset = useCallback(
    () => commit({ ...current.current, adjustments: defaults }),
    [commit, defaults]
  );

  return { ...state, update, setRemember, reset };
}
