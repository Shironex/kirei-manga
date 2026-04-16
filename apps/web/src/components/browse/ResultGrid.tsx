import type { SearchResult } from '@kireimanga/shared';
import { CoverCard } from './CoverCard';

interface Props {
  results: SearchResult[];
}

export function ResultGrid({ results }: Props) {
  if (results.length === 0) return null;
  return (
    <section className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[repeat(var(--library-grid-cols-lg),minmax(0,1fr))]">
      {results.map(result => (
        <CoverCard key={result.id} result={result} />
      ))}
    </section>
  );
}
