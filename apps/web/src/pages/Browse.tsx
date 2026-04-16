import { useMemo, useState } from 'react';
import type { MangaDexSearchOrder, SearchFilters } from '@kireimanga/shared';
import { PageHeader } from '../components/layout/PageHeader';
import { EmptyState } from '../components/layout/EmptyState';
import { SearchBar } from '../components/browse/SearchBar';
import { FilterChips } from '../components/browse/FilterChips';
import { ResultMasthead } from '../components/browse/ResultMasthead';
import { ResultGrid } from '../components/browse/ResultGrid';
import { CoverSkeleton } from '../components/browse/CoverSkeleton';
import { InfiniteSentinel } from '../components/browse/InfiniteSentinel';
import { Segmented, type SegmentedOption } from '../components/settings/Segmented';
import { useBrowseStore, toSearchFilters } from '@/stores/browse-store';
import { useMangaDexSearch } from '@/hooks/useMangaDexSearch';
import { useMangaDexFeed } from '@/hooks/useMangaDexFeed';
import { useT } from '@/hooks/useT';

type FeedTab = 'popular' | 'latest' | 'top';

const FEED_ORDERS: Record<FeedTab, MangaDexSearchOrder> = {
  popular: { followedCount: 'desc' },
  latest: { latestUploadedChapter: 'desc' },
  top: { rating: 'desc' },
};

export function BrowsePage() {
  const t = useT();
  const query = useBrowseStore(s => s.query);
  const filters = useBrowseStore(s => s.filters);

  const searchFilters = useMemo(() => toSearchFilters(filters), [filters]);
  const {
    results,
    loading,
    loadingMore: searchLoadingMore,
    error,
    hasMore: searchHasMore,
    loadMore: searchLoadMore,
    retry,
  } = useMangaDexSearch(query, searchFilters);

  const featured = results.slice(0, 2);
  const rest = results.slice(2);
  const hasQuery = query.trim().length >= 2;

  const [feedTab, setFeedTab] = useState<FeedTab>('popular');
  // Reuse the user-facing filters (rating, demographic, status, language) but
  // swap `order` for the discovery sort so the feed honors content-rating
  // preferences without pulling in the default relevance ordering.
  const feedFilters = useMemo<SearchFilters>(
    () => ({ ...searchFilters, order: FEED_ORDERS[feedTab] }),
    [searchFilters, feedTab]
  );
  const feed = useMangaDexFeed(feedFilters, !hasQuery);

  const feedTabs: ReadonlyArray<SegmentedOption<FeedTab>> = [
    { value: 'popular', label: t('browse.feed.tab.popular') },
    { value: 'latest', label: t('browse.feed.tab.latest') },
    { value: 'top', label: t('browse.feed.tab.top') },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t('browse.eyebrow')}
        kanji="探索"
        title={t('browse.title')}
        subtitle={t('browse.subtitle')}
      />

      <div className="flex flex-col gap-8">
        <SearchBar />
        <FilterChips />

        {!hasQuery && (
          <>
            <div className="flex items-center justify-between gap-6">
              <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
                {t('browse.feed.eyebrow')}
              </span>
              <Segmented
                value={feedTab}
                options={feedTabs}
                onChange={setFeedTab}
                ariaLabel={t('browse.feed.ariaLabel')}
              />
            </div>

            {feed.error && (
              <div className="animate-fade-up flex flex-col items-start gap-3 border-l-2 border-[var(--color-accent)] py-2 pl-5">
                <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
                  {t('common.error.eyebrow')}
                </span>
                <p className="max-w-[52ch] text-[14px] text-foreground">{feed.error}</p>
                <button
                  type="button"
                  onClick={feed.retry}
                  className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-foreground hover:underline"
                >
                  {t('common.retry')}
                </button>
              </div>
            )}

            {feed.loading && feed.results.length === 0 && (
              <div
                className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-5"
                style={{ gridAutoFlow: 'dense' }}
              >
                {Array.from({ length: 10 }).map((_, i) => (
                  <CoverSkeleton key={i} tall={(i + 1) % 5 === 0} />
                ))}
              </div>
            )}

            {!feed.loading && !feed.error && feed.results.length === 0 && (
              <EmptyState
                glyph="探"
                title={t('browse.empty.title')}
                body={t('browse.empty.body')}
                hint={t('browse.empty.hint')}
              />
            )}

            {feed.results.length > 0 && (
              <>
                <ResultGrid results={feed.results} />
                <InfiniteSentinel
                  onVisible={feed.loadMore}
                  disabled={
                    !feed.hasMore || feed.loading || feed.loadingMore || Boolean(feed.error)
                  }
                />
                {feed.loadingMore && (
                  <div className="flex justify-center py-4">
                    <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
                      {t('browse.feed.loadingMore')}
                    </span>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {hasQuery && error && (
          <div className="animate-fade-up flex flex-col items-start gap-3 border-l-2 border-[var(--color-accent)] py-2 pl-5">
            <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
              {t('common.error.eyebrow')}
            </span>
            <p className="max-w-[52ch] text-[14px] text-foreground">{error}</p>
            <button
              type="button"
              onClick={retry}
              className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-foreground hover:underline"
            >
              {t('common.retry')}
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
            title={t('browse.noMatch.title')}
            body={t('browse.noMatch.body')}
          />
        )}

        {hasQuery && results.length > 0 && (
          <>
            <ResultMasthead results={featured} />
            <ResultGrid results={rest} />
            <InfiniteSentinel
              onVisible={searchLoadMore}
              disabled={!searchHasMore || loading || searchLoadingMore || Boolean(error)}
            />
            {searchLoadingMore && (
              <div className="flex justify-center py-4">
                <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
                  {t('browse.feed.loadingMore')}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
