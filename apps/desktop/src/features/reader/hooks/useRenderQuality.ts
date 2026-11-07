import { useEffect, useRef, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import { setRenderQuality } from '@/lib/reader';

import type { Resample } from '../model/adjust';

/** A sharpen slider being dragged settles before pages render again. */
const SETTLE_MS = 250;

/**
 * Sends the resampling filter and sharpening to the pipeline and returns the
 * render revision they took effect under (`undefined` until the first answer).
 * The first call goes out at once so the chapter opens with the right
 * settings; later ones wait for the slider to settle.
 */
export function useRenderQuality(resample: Resample, sharpen: number): number | undefined {
  const [revision, setRevision] = useState<number | undefined>(undefined);
  const sent = useRef(false);

  useEffect(() => {
    if (!isTauri()) return;
    let alive = true;
    const delay = sent.current ? SETTLE_MS : 0;
    sent.current = true;
    const timer = setTimeout(() => {
      setRenderQuality(resample, sharpen).then(
        state => {
          if (alive) setRevision(state.revision);
        },
        () => {
          // Pages keep rendering with the previous settings.
          if (alive) setRevision(current => current ?? 0);
        }
      );
    }, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [resample, sharpen]);

  return revision;
}
