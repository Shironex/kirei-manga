import { cn } from '@/lib/utils';

import { count, formatDuration, longDate, type HeatCell, type Heatmap } from './model';

/**
 * Heatmap fills by level: the empty cell is a quiet ink, then the cover
 * accent in four steps. The fullest step is the accent itself, which keeps
 * at least 3:1 against an empty cell on every seed (contrast.test.ts holds
 * the accent to AA on ink-1).
 */
export const HEAT_FILLS = [
  'bg-ink-2',
  'bg-[color-mix(in_oklch,var(--accent)_28%,var(--ink-2))]',
  'bg-[color-mix(in_oklch,var(--accent)_50%,var(--ink-2))]',
  'bg-[color-mix(in_oklch,var(--accent)_74%,var(--ink-2))]',
  'bg-accent',
] as const;

const WEEKDAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];

function cellTitle(cell: HeatCell): string {
  if (cell.future) return `${longDate(cell.date)}`;
  if (cell.activeMs <= 0 && cell.pagesTurned <= 0) return `${longDate(cell.date)}: no reading`;
  return `${longDate(cell.date)}: ${formatDuration(cell.activeMs)}, ${count(cell.pagesTurned, 'page')}`;
}

/** The year as a grid of days. The grid is one image for assistive tech, named by `label`. */
export function HeatmapGrid({ heatmap, label }: { heatmap: Heatmap; label: string }) {
  const columns = heatmap.weeks.length;
  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid min-w-[720px] gap-x-2 gap-y-1.5"
        style={{ gridTemplateColumns: `28px minmax(0, 1fr)` }}
      >
        <span aria-hidden />
        <div
          aria-hidden
          className="relative h-4 font-mono text-xs text-fg-3"
          style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {heatmap.months.map(month => (
            <span
              key={month.label}
              className="whitespace-nowrap"
              style={{ gridColumnStart: month.column + 1 }}
            >
              {month.label}
            </span>
          ))}
        </div>
        <div aria-hidden className="grid grid-rows-7 gap-[3px] font-mono text-xs text-fg-3">
          {WEEKDAY_LABELS.map((day, i) => (
            <span key={i} className="flex items-center leading-none">
              {day}
            </span>
          ))}
        </div>
        <div
          role="img"
          aria-label={label}
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {heatmap.weeks.flatMap(week =>
            week.map(cell => (
              <span
                key={cell.date}
                title={cell.inYear ? cellTitle(cell) : undefined}
                className={cn(
                  'aspect-square rounded-[3px]',
                  !cell.inYear && 'invisible',
                  cell.inYear && HEAT_FILLS[cell.level],
                  cell.future && 'opacity-40'
                )}
              />
            ))
          )}
        </div>
      </div>
      <div
        aria-hidden
        className="mt-3 flex items-center justify-end gap-1.5 font-mono text-xs text-fg-3"
      >
        <span className="mr-1">Less</span>
        {HEAT_FILLS.map(fill => (
          <span key={fill} className={cn('size-3 rounded-[3px]', fill)} />
        ))}
        <span className="ml-1">More</span>
      </div>
    </div>
  );
}
