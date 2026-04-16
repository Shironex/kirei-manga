import type { Series } from '@kireimanga/shared';
import { LibraryCoverCard } from './LibraryCoverCard';

interface Props {
  series: Series[];
}

/**
 * Asymmetric 5-col grid mirroring Browse's ResultGrid so the Library and
 * Browse views stay visually in lockstep. Every 5th card spans two rows.
 */
export function LibraryGrid({ series }: Props) {
  if (series.length === 0) return null;
  return (
    <section
      className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[repeat(var(--library-grid-cols-lg),minmax(0,1fr))]"
      style={{ gridAutoFlow: 'dense' }}
    >
      {series.map((entry, i) => {
        const tall = (i + 1) % 5 === 0;
        return (
          <LibraryCoverCard key={entry.id} series={entry} sizeHint={tall ? 'tall' : 'default'} />
        );
      })}
    </section>
  );
}
