import { useMemo } from 'react';
import type { FitMode, ReaderDirection } from '@kireimanga/shared';

interface Props {
  pages: string[];
  /** Primary page index of the spread to render (snapped by the store). */
  primaryIndex: number;
  fit: FitMode;
  direction: ReaderDirection;
}

function fitClass(fit: FitMode): string {
  switch (fit) {
    case 'width':
      // Each image takes up to half of the row.
      return 'max-w-[50vw] h-auto';
    case 'original':
      return 'max-w-none max-h-none';
    case 'height':
    default:
      return 'h-screen w-auto';
  }
}

export function DoublePageView({ pages, primaryIndex, fit, direction }: Props) {
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

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-auto bg-[var(--color-ink-sunken)]">
      <div className={`flex ${dirClass} items-center gap-0`}>
        {current.map(i => (
          <img
            key={`${pages[i]}-${i}`}
            src={pages[i]}
            alt={`Page ${i + 1} of ${pages.length}`}
            draggable={false}
            className={`select-none ${fitClass(fit)}`}
          />
        ))}
      </div>
    </div>
  );
}
