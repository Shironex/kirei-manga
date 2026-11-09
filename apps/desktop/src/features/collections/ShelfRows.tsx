import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';

import { runFilter, type FilterResult, type ShelfItem, type SmartFilter } from '@/lib/shelf';
import { useCoverPreview } from '@/lib/theme/coverTheme';

import { useLibrary } from '../library/libraryStore';
import { SeriesTile } from '../library/SeriesTile';
import { ROW_LIMIT, seriesCount } from './model';
import { RemoteTile, useResolvedItems } from './ShelfItems';
import { useShelf } from './shelfStore';

/**
 * Rows on Home under the continue hero: Want to Read when it has anything,
 * then every pinned smart filter in the user's order. Each row shows the
 * first covers and links to the full list. A pinned filter with no match
 * stays out of the way.
 */
export function ShelfRows() {
  const shelf = useShelf();
  const pinned = shelf.overview.filters.filter(f => f.pinned);
  const results = usePinnedResults(pinned);
  if (shelf.status !== 'ready') return null;

  return (
    <>
      {shelf.want.length > 0 && (
        <Row
          id="want"
          title="Want to Read"
          total={shelf.overview.wantCount}
          items={shelf.want.slice(0, ROW_LIMIT)}
          link={{ to: '/collections/$collectionId', params: { collectionId: 'want' } }}
        />
      )}
      {pinned.map(filter => {
        const result = results[filter.id];
        if (!result || result.total === 0) return null;
        return (
          <Row
            key={filter.id}
            id={`filter-${filter.id}`}
            title={filter.name}
            total={result.total}
            items={result.items}
            link={{ to: '/filters/$filterId', params: { filterId: String(filter.id) } }}
          />
        );
      })}
    </>
  );
}

/** The first covers of each pinned filter, read again when the shelf or the catalogue changes. */
function usePinnedResults(pinned: SmartFilter[]): Record<number, FilterResult> {
  const { version } = useShelf();
  const { version: catalogue } = useLibrary();
  const [results, setResults] = useState<Record<number, FilterResult>>({});
  const key = JSON.stringify(pinned.map(f => [f.id, f.query]));

  useEffect(() => {
    const filters = JSON.parse(key) as [number, SmartFilter['query']][];
    if (filters.length === 0) return;
    let live = true;
    void Promise.all(
      filters.map(([id, query]) =>
        runFilter(query, ROW_LIMIT).then(
          result => [id, result] as const,
          () => null
        )
      )
    ).then(pairs => {
      if (!live) return;
      const next: Record<number, FilterResult> = {};
      for (const pair of pairs) if (pair) next[pair[0]] = pair[1];
      setResults(next);
    });
    return () => {
      live = false;
    };
  }, [key, version, catalogue]);

  return results;
}

type RowLink =
  | { to: '/collections/$collectionId'; params: { collectionId: string } }
  | { to: '/filters/$filterId'; params: { filterId: string } };

function Row({
  id,
  title,
  total,
  items,
  link,
}: {
  id: string;
  title: string;
  total: number;
  items: ShelfItem[];
  link: RowLink;
}) {
  const { local, remote } = useResolvedItems(items);
  const preview = useCoverPreview();
  const headingId = `row-${id}`;
  if (local.length + remote.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="mb-12">
      <div className="mb-4 flex items-end gap-4">
        <h2
          id={headingId}
          className="m-0 font-display text-2xl leading-[1.1] font-[650] font-condensed"
        >
          {title}
        </h2>
        <span className="tabular text-sm text-fg-3">{seriesCount(total)}</span>
        <Link
          {...link}
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-fg-2 no-underline transition-colors duration-base hover:text-fg-1"
          aria-label={`See all of ${title}`}
        >
          See all <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>
      <ul
        className="-mx-2 m-0 flex list-none snap-x gap-6 overflow-x-auto px-2 pt-1 pb-3 [scrollbar-width:thin]"
        aria-label={title}
      >
        {local.map(series => (
          <li key={series.id} className="w-[140px] shrink-0 snap-start">
            <SeriesTile
              series={series}
              onPointerEnter={() => preview.enter(series.cover)}
              onPointerLeave={preview.leave}
              onFocus={() => preview.enter(series.cover)}
              onBlur={preview.leave}
            />
          </li>
        ))}
        {remote.map(item => (
          <li key={`${item.source}:${item.remoteId}`} className="w-[140px] shrink-0 snap-start">
            <RemoteTile item={item} />
          </li>
        ))}
      </ul>
    </section>
  );
}
