import { useLayoutEffect, useRef, useState, type FocusEvent } from 'react';

import type { SeriesSummary } from '@/lib/library';

import { gridMetrics, visibleRows, type GridSpec } from './gridLayout';
import { SeriesTile, TILE_CAPTION } from './SeriesTile';

const SPEC: GridSpec = { minTile: 150, gapX: 24, gapY: 32, caption: TILE_CAPTION };
const OVERSCAN = 2;

/** Nearest scrolling ancestor; the shell scrolls #main, not the window. */
function scrollParent(el: HTMLElement): HTMLElement {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return document.documentElement;
}

interface Viewport {
  width: number;
  scrollTop: number;
  height: number;
  /** Grid top within the scroll content. */
  top: number;
}

/**
 * The cover grid, virtualised: only the rows near the viewport are in the DOM,
 * so 10k series cost as much as a screenful. Rows are absolutely placed from
 * fixed geometry (see gridLayout.ts), which keeps scrolling free of layout
 * work. A focused tile scrolls into view, so Tab walks the whole list.
 */
export function ShelfGrid({ series, label }: { series: SeriesSummary[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<Viewport>({ width: 0, scrollTop: 0, height: 900, top: 0 });

  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    const scroller = scrollParent(grid);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const top =
        grid.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      const next = {
        width: grid.clientWidth,
        scrollTop: scroller.scrollTop,
        height: scroller.clientHeight,
        top,
      };
      setView(prev =>
        prev.width === next.width &&
        prev.scrollTop === next.scrollTop &&
        prev.height === next.height &&
        prev.top === next.top
          ? prev
          : next
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const resize = new ResizeObserver(schedule);
    resize.observe(grid);
    resize.observe(scroller);
    scroller.addEventListener('scroll', schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      scroller.removeEventListener('scroll', schedule);
    };
  }, []);

  const metrics = gridMetrics(view.width || 1, SPEC);
  const rows = Math.ceil(series.length / metrics.columns);
  const [start, end] = visibleRows({
    scrollTop: view.scrollTop,
    viewport: view.height,
    gridTop: view.top,
    stride: metrics.stride,
    rows,
    overscan: OVERSCAN,
  });
  const height = rows > 0 ? rows * metrics.stride - SPEC.gapY : 0;

  const reveal = (event: FocusEvent<HTMLElement>) => {
    if (event.target.matches(':focus-visible')) {
      event.target.scrollIntoView({ block: 'nearest' });
    }
  };

  const rowEls = [];
  for (let row = start; row < end; row++) {
    const items = series.slice(row * metrics.columns, (row + 1) * metrics.columns);
    rowEls.push(
      <div
        key={row}
        role="presentation"
        className="absolute inset-x-0 grid"
        style={{
          top: row * metrics.stride,
          height: metrics.rowHeight,
          gridTemplateColumns: `repeat(${metrics.columns}, minmax(0, 1fr))`,
          columnGap: SPEC.gapX,
        }}
      >
        {items.map((s, i) => (
          <div
            key={s.id}
            role="listitem"
            aria-setsize={series.length}
            aria-posinset={row * metrics.columns + i + 1}
          >
            <SeriesTile series={s} onFocus={reveal} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={ref} role="list" aria-label={label} className="relative" style={{ height }}>
      {rowEls}
    </div>
  );
}
