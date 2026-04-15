import { useMemo } from 'react';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';
import { SearchBar } from '../components/browse/SearchBar';
import { FilterChips } from '../components/browse/FilterChips';
import { ResultMasthead } from '../components/browse/ResultMasthead';
import { ResultGrid } from '../components/browse/ResultGrid';
import { CoverSkeleton } from '../components/browse/CoverSkeleton';
import { useBrowseStore, toSearchFilters } from '@/stores/browse-store';
import { useMangaDexSearch } from '@/hooks/useMangaDexSearch';

export function BrowsePage() {
  const query = useBrowseStore(s => s.query);
  const filters = useBrowseStore(s => s.filters);

  const searchFilters = useMemo(() => toSearchFilters(filters), [filters]);
  const { results, loading, error, retry } = useMangaDexSearch(query, searchFilters);

  const featured = results.slice(0, 2);
  const rest = results.slice(2);
  const hasQuery = query.trim().length >= 2;

  return (
    <>
      <PageHeader
        eyebrow="MangaDex"
        kanji="探索"
        title="Find the next one."
        subtitle="Search MangaDex by title, author, tag, or language. Official API only — no scraping, no sketchy mirrors."
      />

      <div className="flex flex-col gap-8">
        <SearchBar />
        <FilterChips />

        {!hasQuery && (
          <EmptyState
            glyph="探"
            title="Search hasn't started."
            body="Type at least two characters above, or press ⌘K from anywhere. Results stream in as they arrive."
            hint="Tip: filters apply to every search"
          />
        )}

        {hasQuery && error && (
          <div className="animate-fade-up flex flex-col items-start gap-3 border-l-2 border-[var(--color-accent)] py-2 pl-5">
            <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
              Something went sideways
            </span>
            <p className="max-w-[52ch] text-[14px] text-foreground">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-foreground hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {hasQuery && loading && results.length === 0 && (
          <div
            className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5"
            style={{ gridAutoFlow: 'dense' }}
          >
            {Array.from({ length: 10 }).map((_, i) => (
              <CoverSkeleton key={i} tall={(i + 1) % 5 === 0} />
            ))}
          </div>
        )}

        {hasQuery && !loading && !error && results.length === 0 && (
          <EmptyState
            glyph="空"
            title="Nothing matched."
            body="Try a shorter query, or widen the content rating filter. MangaDex indexes titles in their original language too."
          />
        )}

        {results.length > 0 && (
          <>
            <ResultMasthead results={featured} />
            <ResultGrid results={rest} />
          </>
        )}
      </div>
    </>
  );
}
