import type { ReactNode } from 'react';

import { itemCoverSrc, type ShelfItem } from '@/lib/shelf';
import { cn } from '@/lib/utils';

import { Cover } from '../library/Cover';
import { useSeriesById } from './ShelfItems';

/**
 * Up to three covers fanned like books on a shelf, the first in front: the
 * face of a collection or of Want to Read. An empty list shows a quiet
 * placeholder with `empty` in it.
 */
export function CoverStack({
  items,
  label,
  empty,
  className,
}: {
  items: readonly ShelfItem[];
  label: string;
  empty?: ReactNode;
  className?: string;
}) {
  const byId = useSeriesById();
  const shown = items.slice(0, 3);
  return (
    <span
      className={cn('relative block aspect-[4/3] overflow-hidden rounded-xl bg-ink-1', className)}
    >
      {shown.length === 0 ? (
        <span
          aria-hidden
          className="absolute inset-0 grid place-items-center bg-[linear-gradient(160deg,oklch(0.26_calc(var(--accent-c)*0.5)_var(--seed-h)),var(--ink-1))] text-fg-3"
        >
          {empty}
        </span>
      ) : (
        shown
          .map((item, i) => {
            const series = item.seriesId !== null ? byId.get(item.seriesId) : undefined;
            return (
              <Cover
                key={`${item.seriesId ?? item.remoteId}`}
                cover={series?.cover ?? null}
                src={series ? undefined : itemCoverSrc(item)}
                title={series?.title ?? item.title ?? label}
                className={cn(
                  'absolute bottom-[-12%] w-[46%] transition-transform duration-slow ease-expo',
                  i === 0 && 'left-[27%] z-[3] group-hover:-translate-y-1.5',
                  i === 1 && 'left-[9%] z-[2] -rotate-6 opacity-90',
                  i === 2 && 'left-[45%] z-[1] rotate-6 opacity-80'
                )}
              />
            );
          })
          .reverse()
      )}
    </span>
  );
}
