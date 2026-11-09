import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { LibraryBig } from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Segmented, SegmentedItem } from '@/components/ui/segmented';
import type { ReadingStats } from '@/lib/stats';
import { usePageCover } from '@/lib/theme/coverTheme';

import { YearCard } from './card/YearCard';
import { HeatmapGrid } from './Heatmap';
import {
  averageSession,
  buildHeatmap,
  busiestMonth,
  count,
  describeHeatmap,
  durationHeadline,
  formatDuration,
  isEmptyYear,
  longDate,
} from './model';
import { AllTime, MonthBars, StatsSection, StatTiles, TopSeries } from './StatsSections';
import { useStats } from './useStats';

const LEAD = 'Kept on this computer and in your backups. Nothing is sent anywhere.';

/** `/stats`: reading time, streaks, the year as a heatmap, top series and the year card. */
export function StatsPage() {
  const [year, setYear] = useState<number | null>(null);
  const state = useStats(year);
  const stats = state.status === 'ready' ? state.stats : null;
  usePageCover(stats?.topSeries.find(s => s.cover)?.cover);

  const yearPicker = stats && stats.years.length > 1 && (
    <Segmented
      aria-label="Year"
      value={String(stats.year)}
      onValueChange={value => setYear(Number(value))}
    >
      {stats.years.map(y => (
        <SegmentedItem key={y} value={String(y)}>
          {y}
        </SegmentedItem>
      ))}
    </Segmented>
  );

  return (
    <>
      <PageHeader title="Reading stats" lead={LEAD} actions={yearPicker} />
      {state.status === 'loading' && <span className="sr-only">Loading your reading stats</span>}
      {state.status === 'unavailable' && (
        <EmptyState title="Stats live in the desktop app">
          <p>Reading sessions are recorded by the app itself, so there is nothing to show here.</p>
        </EmptyState>
      )}
      {state.status === 'error' && (
        <EmptyState title="Your stats did not load" tone="alert">
          <p>{state.message}</p>
        </EmptyState>
      )}
      {stats &&
        (stats.allTime.sessions === 0 ? (
          <NoReadingYet />
        ) : (
          <StatsBody key={stats.year} stats={stats} />
        ))}
    </>
  );
}

function NoReadingYet() {
  return (
    <EmptyState
      title="No reading recorded yet"
      actions={
        <Button variant="primary" asChild>
          <Link to="/library">
            <LibraryBig /> Open the library
          </Link>
        </Button>
      }
    >
      <p>
        Open a chapter from your library and turn a few pages. Time, pages, streaks and your year in
        review build up from there.
      </p>
    </EmptyState>
  );
}

function StatsBody({ stats }: { stats: ReadingStats }) {
  const heatmap = useMemo(
    () => buildHeatmap(stats.year, stats.days, stats.today),
    [stats.year, stats.days, stats.today]
  );
  const headline = durationHeadline(stats.yearTotals.activeMs);
  const month = busiestMonth(stats.months);
  const isThisYear = stats.today.startsWith(String(stats.year));
  const streak = stats.currentStreak.days;

  return (
    <div className="grid gap-12">
      <section aria-label={`${stats.year} at a glance`} className="grid gap-6">
        <p className="m-0 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="tabular font-display text-6xl font-[800] tracking-[-0.02em] text-accent [font-variation-settings:'wdth'_75,'opsz'_96]">
            {headline.value}
          </span>
          <span className="font-display text-3xl font-[650] text-fg-1 font-condensed">
            {headline.unit} read in {stats.year}
          </span>
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-1.5 p-0 text-sm text-fg-2">
          {isThisYear && (
            <li>
              <b className="font-semibold text-fg-1">
                {streak > 0 ? `${streak.toLocaleString('en')} day` : 'No'} streak
              </b>
              {streak > 0
                ? stats.currentStreak.end === stats.today
                  ? ', read today'
                  : ', read today to keep it'
                : ', start one today'}
            </li>
          )}
          {stats.yearTotals.sessions > 0 && (
            <li>
              About{' '}
              <b className="font-semibold text-fg-1">{formatDuration(averageSession(stats))}</b> a
              sitting
            </li>
          )}
          {month && (
            <li>
              Most in <b className="font-semibold text-fg-1">{month.label}</b>
            </li>
          )}
          <li>
            <b className="font-semibold text-fg-1">{formatDuration(stats.allTime.activeMs)}</b> all
            time, longest streak {count(stats.longestStreak.days, 'day')}
          </li>
        </ul>
      </section>

      {isEmptyYear(stats) ? (
        <EmptyState title={`Nothing read in ${stats.year}`}>
          <p>Pick another year above, or open a chapter to start this one.</p>
        </EmptyState>
      ) : (
        <>
          <StatTiles stats={stats} />

          <StatsSection
            title="Every day of the year"
            aside={
              heatmap.busiest
                ? `Busiest: ${longDate(heatmap.busiest.date)}, ${formatDuration(heatmap.busiest.activeMs)}`
                : null
            }
          >
            <Panel>
              <HeatmapGrid heatmap={heatmap} label={describeHeatmap(stats, heatmap)} />
            </Panel>
          </StatsSection>

          <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <StatsSection title="Most read" aside={`by time, ${stats.year}`}>
              <TopSeries series={stats.topSeries} />
            </StatsSection>
            <div className="grid content-start gap-12">
              <StatsSection title="By month">
                <MonthBars months={stats.months} />
              </StatsSection>
              <StatsSection title="All time">
                <AllTime stats={stats} />
              </StatsSection>
            </div>
          </div>
        </>
      )}

      <StatsSection title="Year in review">
        <Panel>
          <YearCard stats={stats} />
        </Panel>
      </StatsSection>
    </div>
  );
}
