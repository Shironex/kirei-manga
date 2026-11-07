import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '@/lib/utils';

import type { useZoomPan } from '../hooks/useZoomPan';
import { SPREAD_GAP, type ScreenSize } from '../model/fit';
import type { Direction, Fit } from '../model/prefs';
import { PageImage } from './PageImage';

/** Space kept around the pages, in CSS pixels. */
export const STAGE_INSET = 8;
/** Wheel travel that turns one page, and the pause before the next turn. */
const WHEEL_TURN_DELTA = 60;
const WHEEL_COOLDOWN_MS = 280;
/** Pointer travel that makes a press a drag instead of a tap. */
const DRAG_SLOP = 5;

type ZoomPan = ReturnType<typeof useZoomPan>;

export interface PagedViewProps {
  /** Indexes on screen, in reading order. */
  screen: readonly number[];
  /** Size of each page on screen, from `fitScreen`. */
  size: ScreenSize;
  direction: Direction;
  fit: Fit;
  /** The stage less the inset, for telling when a page scrolls. */
  inner: { width: number; height: number };
  urlFor: (index: number) => string;
  zoom: ZoomPan;
  /** Moves `delta` screens in reading order. */
  onStep: (delta: number) => void;
  onToggleChrome: () => void;
  onMeasure: (index: number, width: number, height: number) => void;
  /** The end of chapter card is up: dim the pages behind it. */
  dimmed: boolean;
}

/** Single and double page modes: one screen of pages, zoom, pan and tap zones. */
export function PagedView({
  screen,
  size,
  direction,
  fit,
  inner,
  urlFor,
  zoom,
  onStep,
  onToggleChrome,
  onMeasure,
  dimmed,
}: PagedViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const rtl = direction === 'rtl';

  const contentWidth =
    size.widths.reduce((sum, width) => sum + width, 0) + SPREAD_GAP * (screen.length - 1);
  // Fits other than screen can overflow the stage; then the page scrolls.
  const scrolls =
    fit !== 'screen' &&
    zoom.zoom === 1 &&
    (size.height > inner.height + 1 || contentWidth > inner.width + 1);

  // A new screen starts at its top, at fit.
  const screenKey = screen.join(',');
  useEffect(() => {
    // Reading starts at the top, on the right in right to left.
    const root = rootRef.current;
    root?.scrollTo({ top: 0, left: rtl ? root.scrollWidth : 0 });
    // Only a new screen moves the scroll, not a direction change mid-page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screenKey]);

  // Wheel: pinch or Ctrl zooms, a zoomed page pans, a scrolling page scrolls,
  // otherwise the wheel turns pages. Not passive, so it can stop the default.
  const handlers = useRef({ zoom, onStep, scrolls, rtl });
  handlers.current = { zoom, onStep, scrolls, rtl };
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let travel = 0;
    let lockedUntil = 0;
    const onWheel = (event: WheelEvent) => {
      const { zoom, onStep, scrolls, rtl } = handlers.current;
      if (event.ctrlKey) {
        event.preventDefault();
        const rect = root.getBoundingClientRect();
        const at = {
          x: event.clientX - rect.left - rect.width / 2,
          y: event.clientY - rect.top - rect.height / 2,
        };
        zoom.zoomBy(Math.exp(-event.deltaY * 0.01), at);
        return;
      }
      if (zoom.zoom > 1) {
        event.preventDefault();
        zoom.panBy(-event.deltaX, -event.deltaY);
        return;
      }
      if (scrolls) return;
      event.preventDefault();
      const now = performance.now();
      if (now < lockedUntil) return;
      // Horizontal swipes follow the reading direction.
      const horizontal = rtl ? -event.deltaX : event.deltaX;
      travel += Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : horizontal;
      if (Math.abs(travel) >= WHEEL_TURN_DELTA) {
        onStep(travel > 0 ? 1 : -1);
        travel = 0;
        lockedUntil = now + WHEEL_COOLDOWN_MS;
      }
    };
    root.addEventListener('wheel', onWheel, { passive: false });
    return () => root.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (event: ReactPointerEvent) => {
    if (event.button !== 0 || zoom.zoom === 1) return;
    drag.current = { x: event.clientX, y: event.clientY, moved: false };
  };
  const onPointerMove = (event: ReactPointerEvent) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_SLOP) return;
    if (!current.moved) {
      // Captured only once it is a drag, so a plain tap still reaches the zones.
      event.currentTarget.setPointerCapture(event.pointerId);
      zoom.setDragging(true);
    }
    current.moved = true;
    current.x = event.clientX;
    current.y = event.clientY;
    zoom.panBy(dx, dy);
  };
  const onPointerUp = () => {
    suppressClick.current = drag.current?.moved ?? false;
    drag.current = null;
    zoom.setDragging(false);
  };
  const tap = (action: () => void) => () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    action();
  };
  const zoomToggle = (event: React.MouseEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (zoom.zoom > 1) zoom.reset();
    else
      zoom.zoomBy(2, {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      });
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        'absolute inset-0 overscroll-contain',
        scrolls ? 'overflow-auto' : 'overflow-hidden',
        zoom.zoom > 1 && (zoom.dragging ? 'cursor-grabbing' : 'cursor-grab')
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className="flex min-h-full w-max min-w-full items-center justify-center"
        style={{ padding: STAGE_INSET }}
      >
        <div
          data-testid="spread"
          className={cn(
            'flex',
            rtl && 'flex-row-reverse',
            !zoom.dragging && 'transition-[transform,opacity,filter] duration-slow ease-expo',
            dimmed && 'opacity-35 blur-[2px]'
          )}
          style={{
            gap: SPREAD_GAP,
            width: contentWidth || undefined,
            transform: `translate3d(${zoom.x}px, ${zoom.y}px, 0) scale(${zoom.zoom})`,
          }}
        >
          {screen.map((index, slot) => (
            <div
              key={index}
              className="relative bg-ink-1 shadow-[0_30px_80px_-30px_oklch(0_0_0/0.9)]"
              style={{ width: size.widths[slot], height: size.height }}
            >
              <PageImage
                src={urlFor(index)}
                alt={`Page ${index + 1}`}
                className="size-full object-contain"
                onLoad={(width, height) => onMeasure(index, width, height)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Edge tap zones: the outer thirds turn pages, the middle shows the chrome. */}
      <div className="pointer-events-none absolute inset-0 z-[1] grid grid-cols-[3fr_4fr_3fr]">
        <button
          type="button"
          tabIndex={-1}
          aria-label={rtl ? 'Next page' : 'Previous page'}
          className="pointer-events-auto cursor-pointer outline-none focus-visible:bg-[linear-gradient(90deg,var(--accent-wash),transparent)]"
          onClick={tap(() => onStep(rtl ? 1 : -1))}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Show or hide reader controls"
          className={cn(
            'pointer-events-auto outline-none',
            zoom.zoom > 1 ? 'cursor-grab' : 'cursor-default'
          )}
          onClick={tap(onToggleChrome)}
          onDoubleClick={zoomToggle}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={rtl ? 'Previous page' : 'Next page'}
          className="pointer-events-auto cursor-pointer outline-none focus-visible:bg-[linear-gradient(270deg,var(--accent-wash),transparent)]"
          onClick={tap(() => onStep(rtl ? -1 : 1))}
        />
      </div>
    </div>
  );
}
