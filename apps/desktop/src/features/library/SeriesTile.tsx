import type { ComponentProps } from 'react';
import { Link } from '@tanstack/react-router';

import { Progress } from '@/components/ui/progress';
import type { SeriesSummary } from '@/lib/library';
import { cn } from '@/lib/utils';

import { Cover } from './Cover';
import { readingState, seriesProgress } from './shelf';

/** Caption height the grid reserves under every cover, px. Keep in step with the markup. */
export const TILE_CAPTION = 76;

function subline(series: SeriesSummary): string {
  const state = readingState(series);
  if (state === 'finished') return `${series.chapterCount} of ${series.chapterCount} read`;
  if (state === 'reading') {
    const next = Math.min(series.completedCount + 1, series.chapterCount);
    return `Ch. ${next} of ${series.chapterCount}`;
  }
  return series.chapterCount === 1 ? '1 chapter' : `${series.chapterCount} chapters`;
}

/** One cover in the library grid: opens the series page. */
export function SeriesTile({
  series,
  className,
  ...props
}: { series: SeriesSummary; className?: string } & Pick<
  ComponentProps<'a'>,
  'onFocus' | 'onPointerEnter' | 'onPointerLeave'
>) {
  const state = readingState(series);
  const fresh = series.newCount;
  return (
    <Link
      to="/series/$seriesId"
      params={{ seriesId: String(series.id) }}
      className={cn(
        'group grid content-start gap-2.5 rounded-cover text-fg-1 no-underline outline-none',
        className
      )}
      {...props}
    >
      <Cover
        cover={series.cover}
        title={series.title}
        className={cn(
          'transition-[transform,box-shadow] duration-slow ease-expo',
          'group-hover:-translate-y-1 group-focus-visible:-translate-y-1',
          'group-hover:shadow-[0_28px_50px_-20px_oklch(0.45_var(--accent-c)_var(--seed-h)/0.55),0_0_0_1px_oklch(1_0_0/0.1)]',
          'group-focus-visible:outline-2 group-focus-visible:outline-offset-[3px] group-focus-visible:outline-accent',
          series.missing && 'opacity-50 grayscale'
        )}
      >
        {fresh > 0 && (
          <span
            aria-hidden
            className="tabular absolute top-2 right-2 z-[1] grid h-[22px] min-w-[22px] place-items-center rounded-chip bg-accent px-1.5 text-xs leading-none font-bold text-on-accent"
          >
            {fresh}
          </span>
        )}
      </Cover>
      <span className="grid gap-0.5">
        <span className="line-clamp-2 leading-[1.3] font-semibold">{series.title}</span>
        <span className="tabular flex items-center gap-2 text-xs text-fg-3">
          <span>{series.missing ? 'Folder missing' : subline(series)}</span>
          {fresh > 0 && <span className="font-semibold text-accent">{fresh} new</span>}
        </span>
      </span>
      {state === 'reading' && (
        <Progress
          value={seriesProgress(series)}
          label={`${series.title}, ${Math.round(seriesProgress(series) * 100)}% read`}
          className="mt-0.5"
        />
      )}
    </Link>
  );
}
