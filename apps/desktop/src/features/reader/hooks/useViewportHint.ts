import { useEffect, useRef, useState } from 'react';

import { isTauri } from '@/lib/ipc';
import { setViewport } from '@/lib/reader';

/** Largest side the backend accepts, in device pixels. */
const MAX_SIDE = 16_384;
/** Resizes settle before the backend re-renders the window of pages. */
const SETTLE_MS = 150;

/** The CSS box one page is shown in; a `null` side is unbounded (it scrolls). */
export interface PageBox {
  width: number | null;
  height: number | null;
}

/** One side in device pixels, rounded up and kept inside what the backend takes. */
function deviceSide(css: number | null, scale: number): number | null {
  if (css === null) return null;
  return Math.min(MAX_SIDE, Math.max(1, Math.ceil(css * scale)));
}

/**
 * Tells the backend how large pages are shown so it renders them at that size
 * (times the device pixel ratio and the zoom), and returns the render revision
 * for page URLs. `undefined` waits (the stage is not measured yet). The first
 * hint goes out at once, later ones once resizing settles; the backend keeps
 * the revision when the box did not change, so this is cheap on every resize.
 */
export function useViewportHint(box: PageBox | undefined, zoom: number): number | undefined {
  const [revision, setRevision] = useState<number | undefined>(undefined);
  const sent = useRef(false);
  const measured = box !== undefined;
  const scale = (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1) * zoom;
  const width = box ? deviceSide(box.width, scale) : null;
  const height = box ? deviceSide(box.height, scale) : null;

  useEffect(() => {
    if (!isTauri() || !measured) return;
    let alive = true;
    const delay = sent.current ? SETTLE_MS : 0;
    sent.current = true;
    const timer = setTimeout(() => {
      setViewport(width, height).then(
        state => {
          if (alive) setRevision(state.revision);
        },
        () => {
          // A rejected hint keeps the last revision: pages still load, only
          // at the previous size.
        }
      );
    }, delay);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [measured, width, height]);

  return revision;
}
