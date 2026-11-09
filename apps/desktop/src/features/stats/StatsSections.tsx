import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

import { Panel } from '@/components/ui/panel';
import { Cover } from '@/features/library/Cover';
import type { ReadingStats, SeriesReading } from '@/lib/stats';
import { useCoverPreview } from '@/lib/theme/coverTheme';
import { cn } from '@/lib/utils';

import { count, formatDuration, MONTHS, streakRange } from './model';

/** A titled block of the stats page. */
export function StatsSection({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={cn('min-w-0', className)}>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="m-0 font-display text-xl font-[650] font-condensed">{title}</h2>
        {aside && <div className="text-sm text-fg-3">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** One number with its label, the unit of the tile row. */
function Tile({ value, label, hint }: { value: string; label: string; hint?: string | null }) {
  return (
    <div className="min-w-0 px-6 py-5 [&+&]:border-l [&+&]:border-line">
      <dt className="text-sm text-fg-2">{label}</dt>
      <dd className="tabular m-0 mt-1 font-display text-4xl font-bold font-condensed">{value}</dd>
      {hint && <dd className="m-0 mt-1 truncate text-xs text-fg-3">{hint}</dd>}
    </div>
  );
}

/** The year's totals and the streaks, as a row of tiles. */
export function StatTiles({ stats }: { stats: ReadingStats }) {
  const t = stats.yearTotals;
  return (
    <Panel padding="none" className="overflow-hidden">
      <dl className="m-0 grid grid-cols-2 lg:grid-cols-4 [&>*:nth-child(3)]:max-lg:border-l-0 [&>*:nth-child(n+3)]:max-lg:border-t [&>*:nth-child(n+3)]:max-lg:border-line">
        <Tile
          value={t.chaptersFinished.toLocaleString('en')}
          label="Chapters finished"
          hint={t.seriesRead > 0 ? `across ${count(t.seriesRead, 'series', 'series')}` : null}
        />
        <Tile
          value={t.pagesTurned.toLocaleString('en')}
          label="Pages turned"
          hint={t.sessions > 0 ? count(t.sessions, 'session') : null}
        />
        <Tile
          value={t.daysRead.toLocaleString('en')}
          label="Days with reading"
          hint={
            stats.longestSessionMs > 0
              ? `longest sitting ${formatDuration(stats.longestSessionMs)}`
              : null
          }
        />
        <Tile
          value={count(stats.yearLongestStreak.days, 'day')}
          label="Longest streak"
          hint={streakRange(stats.yearLongestStreak, stats.year)}
        />
      </dl>
    </Panel>
  );
}

/** Every year together, as a short list. */
export function AllTime({ stats }: { stats: ReadingStats }) {
  const t = stats.allTime;
  const rows: [string, string][] = [
    ['Time read', formatDuration(t.activeMs)],
    ['Chapters finished', t.chaptersFinished.toLocaleString('en')],
    ['Pages turned', t.pagesTurned.toLocaleString('en')],
    ['Days with reading', t.daysRead.toLocaleString('en')],
    ['Series', t.seriesRead.toLocaleString('en')],
    ['Longest streak', count(stats.longestStreak.days, 'day')],
  ];
  return (
    <Panel padding="none">
      <dl className="m-0 grid grid-cols-2">
        {rows.map(([label, value], i) => (
          <div
            key={label}
            className={cn(
              'flex items-baseline justify-between gap-4 px-6 py-3.5',
              i % 2 === 1 && 'border-l border-line',
              i > 1 && 'border-t border-line'
            )}
          >
            <dt className="text-sm text-fg-2">{label}</dt>
            <dd className="tabular m-0 font-medium text-fg-1">{value}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}

/** Active time per month as bars, tallest month full height. */
export function MonthBars({ months }: { months: number[] }) {
  const max = Math.max(1, ...months);
  return (
    <Panel>
      <ol className="m-0 grid h-[180px] list-none grid-cols-12 items-end gap-2 p-0">
        {months.map((ms, i) => {
          const month = MONTHS[i] ?? '';
          const share = ms / max;
          return (
            <li key={month} className="flex h-full min-w-0 flex-col items-center justify-end gap-2">
              <span className="sr-only">
                {month}: {formatDuration(ms)}
              </span>
              <span
                aria-hidden
                title={`${month}: ${formatDuration(ms)}`}
                className={cn(
                  'w-full max-w-7 rounded-t-[4px] transition-[height] duration-slow ease-expo',
                  ms > 0 ? 'bg-accent' : 'bg-ink-3'
                )}
                style={{
                  height: ms > 0 ? `${Math.max(6, share * 100)}%` : '3px',
                  opacity: ms > 0 ? 0.45 + share * 0.55 : 1,
                }}
              />
              <span aria-hidden className="font-mono text-xs text-fg-3">
                {month.slice(0, 1)}
              </span>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}

function SeriesRow({ series, rank, max }: { series: SeriesReading; rank: number; max: number }) {
  const preview = useCoverPreview();
  const share = series.activeMs / Math.max(1, max);
  const body = (
    <>
      <span className="tabular w-6 shrink-0 font-mono text-sm text-accent">0{rank}</span>
      <Cover cover={series.cover} title={series.title} className="w-12 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-fg-1">{series.title}</span>
        <span className="tabular block truncate text-sm text-fg-2">
          {formatDuration(series.activeMs)}
          {series.chaptersFinished > 0 && `, ${count(series.chaptersFinished, 'chapter')}`}
          {`, ${count(series.daysRead, 'day')}`}
        </span>
        <span aria-hidden className="mt-2 block h-1 overflow-hidden rounded-pill bg-ink-3">
          <span
            className="block h-full rounded-pill bg-accent"
            style={{ width: `${Math.max(4, share * 100)}%` }}
          />
        </span>
      </span>
    </>
  );
  const rowClass =
    'flex items-center gap-4 rounded-[10px] px-3 py-2.5 no-underline transition-[background-color] duration-base ease-expo';
  return (
    <li onMouseEnter={() => preview.enter(series.cover)} onMouseLeave={preview.leave}>
      {series.seriesId !== null ? (
        <Link
          to="/series/$seriesId"
          params={{ seriesId: String(series.seriesId) }}
          onFocus={() => preview.enter(series.cover)}
          onBlur={preview.leave}
          className={cn(rowClass, 'hover:bg-ink-2')}
        >
          {body}
        </Link>
      ) : (
        <div className={rowClass} title="No longer in your library">
          {body}
        </div>
      )}
    </li>
  );
}

/** The series read most, with their share of the top one. */
export function TopSeries({ series }: { series: SeriesReading[] }) {
  const max = series[0]?.activeMs ?? 0;
  return (
    <Panel padding="sm">
      <ol className="m-0 grid list-none gap-0.5 p-0">
        {series.map((s, i) => (
          <SeriesRow key={`${s.seriesId ?? 'gone'}-${s.title}`} series={s} rank={i + 1} max={max} />
        ))}
      </ol>
    </Panel>
  );
}
