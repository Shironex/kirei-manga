import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import { Globe } from 'lucide-react';

import type { SeriesSummary } from '@/lib/library';
import { itemCoverSrc, type ShelfItem } from '@/lib/shelf';
import { cn } from '@/lib/utils';

import { Cover } from '../library/Cover';
import { useLibrary } from '../library/libraryStore';
import { ShelfGrid } from '../library/ShelfGrid';
import { TILE_CAPTION } from '../library/SeriesTile';
import { resolveItems, type ResolvedItems } from './model';

const byIdCache = new WeakMap<readonly SeriesSummary[], Map<number, SeriesSummary>>();

/** The catalogue by id, built once per catalogue load. */
export function useSeriesById(): ReadonlyMap<number, SeriesSummary> {
  const { series } = useLibrary();
  let map = byIdCache.get(series);
  if (!map) {
    map = new Map(series.map(s => [s.id, s]));
    byIdCache.set(series, map);
  }
  return map;
}

/** List items split into catalogue series and remote titles, in list order. */
export function useResolvedItems(items: readonly ShelfItem[]): ResolvedItems {
  const byId = useSeriesById();
  return useMemo(() => resolveItems(items, byId), [items, byId]);
}

/**
 * A list's series: local ones in the virtualised cover grid, titles known
 * only from MangaDex in a grid of their own below.
 */
export function ShelfItems({ items, label }: { items: readonly ShelfItem[]; label: string }) {
  const { local, remote } = useResolvedItems(items);
  return (
    <>
      {local.length > 0 && <ShelfGrid series={local} label={label} />}
      {remote.length > 0 && (
        <section aria-labelledby="remote-heading" className={cn(local.length > 0 && 'mt-12')}>
          <h2
            id="remote-heading"
            className="m-0 mb-4 flex items-center gap-2 font-display text-xl font-[650] font-condensed"
          >
            <Globe aria-hidden className="size-4 text-fg-3" /> From MangaDex
          </h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-8 p-0">
            {remote.map(item => (
              <li key={`${item.source}:${item.remoteId}`}>
                <RemoteTile item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/** A title that is not on disk: its cached cover and name, opening its MangaDex page. */
export function RemoteTile({ item, className }: { item: ShelfItem; className?: string }) {
  const body = (
    <>
      <Cover
        cover={null}
        src={itemCoverSrc(item)}
        title={item.title}
        className={cn(
          'transition-[transform,box-shadow] duration-slow ease-expo',
          'group-hover:-translate-y-1 group-focus-visible:-translate-y-1',
          'group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-accent'
        )}
      />
      <span className="grid gap-0.5" style={{ minHeight: TILE_CAPTION - 12 }}>
        <span className="line-clamp-2 leading-[1.3] font-semibold">{item.title}</span>
        <span className="text-xs text-fg-3">MangaDex</span>
      </span>
    </>
  );
  const base = cn(
    'group grid w-full content-start gap-2.5 rounded-cover text-left text-fg-1',
    className
  );
  if (item.source !== 'mangadex' || !item.remoteId) return <div className={base}>{body}</div>;
  return (
    <Link
      to="/online/$mangaId"
      params={{ mangaId: item.remoteId }}
      className={cn(base, 'no-underline outline-none')}
    >
      {body}
    </Link>
  );
}
