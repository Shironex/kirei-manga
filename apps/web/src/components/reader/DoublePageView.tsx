import { useMemo, type ReactNode } from 'react';
import type { FitMode, ReaderDirection } from '@kireimanga/shared';
import { useT } from '@/hooks/useT';

interface Props {
  pages: string[];
  /** Primary page index of the spread to render (snapped by the store). */
  primaryIndex: number;
  fit: FitMode;
  direction: ReaderDirection;
  /** Whether the page at the given index is currently bookmarked. */
  isBookmarked?: (pageIndex: number) => boolean;
  /**
   * Slice G.5 — translation overlay slot for the primary page of the spread.
   * Anchored next to the primary `<img>` in a `position: relative` wrapper.
   * The secondary page in a spread is intentionally not overlaid in v0.3
   * (single hook call drives the active page only) — Slice G later can
   * extend this to a two-overlay setup once the pipeline supports
   * overlapping concurrent runs.
   */
  overlay?: ReactNode;
}

function fitClass(fit: FitMode): string {
  switch (fit) {
    case 'width':
      // Each image takes up to half of the row.
      return 'max-w-[50%] h-auto';
    case 'original':
      return 'max-w-none max-h-none';
    case 'height':
    default:
      return 'h-full w-auto';
  }
}

export function DoublePageView({
  pages,
  primaryIndex,
  fit,
  direction,
  isBookmarked,
  overlay,
}: Props) {
  const t = useT();
  // Spreads: [0] alone (cover), then [1,2], [3,4], ...
  const spreads = useMemo<number[][]>(() => {
    const out: number[][] = [];
    if (pages.length === 0) return out;
    out.push([0]);
    for (let i = 1; i < pages.length; i += 2) {
      const pair: number[] = [i];
      if (i + 1 < pages.length) pair.push(i + 1);
      out.push(pair);
    }
    return out;
  }, [pages.length]);

  const current = spreads.find(s => s[0] === primaryIndex) ?? spreads[0] ?? [];

  const dirClass = direction === 'rtl' ? 'flex-row-reverse' : 'flex-row';
  const showBookmarkDot = isBookmarked?.(primaryIndex) ?? false;

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-auto bg-[var(--color-ink-sunken)]">
      <div className={`flex ${dirClass} items-center gap-0`}>
        {current.map(i => (
          // Wrap each spread page so we can hang the overlay off the primary
          // one without depending on the parent flex container's coordinate
          // system (different `direction` values would otherwise mirror it).
          <div key={`${pages[i]}-${i}`} className="relative">
            <img
              src={pages[i]}
              alt={`Page ${i + 1} of ${pages.length}`}
              draggable={false}
              className={`block select-none ${fitClass(fit)}`}
            />
            {i === primaryIndex && overlay}
          </div>
        ))}
      </div>
      {showBookmarkDot && (
        <span
          aria-label={t('reader.page.bookmarked')}
          className="pointer-events-none absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]"
        />
      )}
    </div>
  );
}
