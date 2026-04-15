import type { SearchResult } from '@kireimanga/shared';
import { CoverCard } from './CoverCard';

interface Props {
  results: SearchResult[];
}

/**
 * Asymmetric 5-col grid. Every 5th card spans two rows so the composition
 * never settles into a perfect grid.
 */
export function ResultGrid({ results }: Props) {
  if (results.length === 0) return null;
  return (
    <section
      className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5"
      style={{ gridAutoFlow: 'dense' }}
    >
      {results.map((result, i) => {
        const tall = (i + 1) % 5 === 0;
        return <CoverCard key={result.id} result={result} sizeHint={tall ? 'tall' : 'default'} />;
      })}
    </section>
  );
}
