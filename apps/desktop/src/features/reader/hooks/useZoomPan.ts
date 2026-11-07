import { useCallback, useMemo, useRef, useState } from 'react';

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
/** Factor one zoom step (a key press, a button) applies. */
export const ZOOM_STEP = 1.25;

export interface ZoomState {
  zoom: number;
  x: number;
  y: number;
}

const FIT: ZoomState = { zoom: 1, x: 0, y: 0 };

/**
 * Keeps the content covering the box: at a zoom of `zoom`, content of
 * `content` size may move at most half its overflow in each direction.
 */
export function clampPan(
  state: ZoomState,
  content: { width: number; height: number },
  box: { width: number; height: number }
): ZoomState {
  const limitX = Math.max(0, (content.width * state.zoom - box.width) / 2);
  const limitY = Math.max(0, (content.height * state.zoom - box.height) / 2);
  return {
    zoom: state.zoom,
    x: Math.min(limitX, Math.max(-limitX, state.x)),
    y: Math.min(limitY, Math.max(-limitY, state.y)),
  };
}

/**
 * Zooms by `factor` keeping the point `at` (relative to the box centre) under
 * the pointer, the way maps and photo viewers zoom.
 */
export function zoomAt(
  state: ZoomState,
  factor: number,
  at: { x: number; y: number } = { x: 0, y: 0 }
): ZoomState {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom * factor));
  if (zoom === MIN_ZOOM) return FIT;
  const scale = zoom / state.zoom;
  return { zoom, x: at.x - (at.x - state.x) * scale, y: at.y - (at.y - state.y) * scale };
}

/**
 * Zoom and pan of the paged view. `content` is the unzoomed size of the
 * screen of pages and `box` the stage it sits in; panning never shows empty
 * stage past the content's edge. `dragging` is true while a pan follows the
 * pointer, so the view can drop its easing for that time.
 */
export function useZoomPan(
  content: { width: number; height: number },
  box: { width: number; height: number }
) {
  const [state, setState] = useState<ZoomState>(FIT);
  const [dragging, setDragging] = useState(false);
  const sizes = useRef({ content, box });
  sizes.current = { content, box };

  const apply = useCallback((next: (current: ZoomState) => ZoomState) => {
    setState(current => clampPan(next(current), sizes.current.content, sizes.current.box));
  }, []);

  const zoomBy = useCallback(
    (factor: number, at?: { x: number; y: number }) =>
      apply(current => zoomAt(current, factor, at)),
    [apply]
  );
  const panBy = useCallback(
    (dx: number, dy: number) =>
      apply(current => ({ ...current, x: current.x + dx, y: current.y + dy })),
    [apply]
  );
  const reset = useCallback(() => setState(FIT), []);

  return useMemo(
    () => ({ ...state, dragging, setDragging, zoomBy, panBy, reset }),
    [state, dragging, zoomBy, panBy, reset]
  );
}
