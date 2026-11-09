import { describe, expect, it } from 'vitest';

import type { ReadingDay, ReadingStats } from '@/lib/stats';

import {
  buildHeatmap,
  busiestMonth,
  dayNumber,
  describeHeatmap,
  durationHeadline,
  formatDuration,
  heatLevel,
  heatThresholds,
  isoDate,
  longDate,
  streakRange,
} from './model';

const MIN = 60_000;

function day(date: string, minutes: number, pages = 1): ReadingDay {
  return {
    date,
    activeMs: minutes * MIN,
    pagesTurned: pages,
    chaptersFinished: 0,
    sessions: 1,
  };
}

const totals = {
  activeMs: 0,
  sessions: 0,
  pagesTurned: 0,
  chaptersFinished: 0,
  daysRead: 0,
  seriesRead: 0,
};

function stats(patch: Partial<ReadingStats> = {}): ReadingStats {
  const none = { days: 0, start: null, end: null };
  return {
    year: 2026,
    today: '2026-11-09',
    years: [2026],
    allTime: totals,
    yearTotals: totals,
    currentStreak: none,
    longestStreak: none,
    yearLongestStreak: none,
    days: [],
    months: Array<number>(12).fill(0),
    topSeries: [],
    longestSessionMs: 0,
    ...patch,
  };
}

describe('durations', () => {
  it('reads as minutes, then hours and minutes, then whole hours', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(29_000)).toBe('0 min');
    expect(formatDuration(45 * MIN)).toBe('45 min');
    expect(formatDuration(60 * MIN)).toBe('1 h');
    expect(formatDuration(200 * MIN)).toBe('3 h 20 min');
    expect(formatDuration(142.4 * 60 * MIN)).toBe('142 h');
    expect(formatDuration(-5)).toBe('0 min');
  });

  it('spells out the unit of a headline', () => {
    expect(durationHeadline(MIN)).toEqual({ value: '1', unit: 'minute' });
    expect(durationHeadline(42 * MIN)).toEqual({ value: '42', unit: 'minutes' });
    expect(durationHeadline(60 * MIN)).toEqual({ value: '1', unit: 'hour' });
    expect(durationHeadline(150 * MIN)).toEqual({ value: '2.5', unit: 'hours' });
    expect(durationHeadline(1234 * 60 * MIN)).toEqual({ value: '1,234', unit: 'hours' });
  });
});

describe('dates', () => {
  it('round trips day numbers', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('2026-03-08')).toBe(20_520);
    expect(isoDate(20_520)).toBe('2026-03-08');
    expect(isoDate(dayNumber('2028-02-29'))).toBe('2028-02-29');
  });

  it('names days without the local time zone shifting them', () => {
    expect(longDate('2026-03-08')).toBe('Sunday 8 March 2026');
    expect(longDate('2026-10-25')).toBe('Sunday 25 October 2026');
  });

  it('writes streak ranges compactly', () => {
    expect(streakRange({ days: 0, start: null, end: null })).toBeNull();
    expect(streakRange({ days: 1, start: '2026-03-08', end: '2026-03-08' }, 2026)).toBe('8 March');
    expect(streakRange({ days: 7, start: '2026-03-08', end: '2026-03-14' }, 2026)).toBe(
      '8 to 14 March'
    );
    expect(streakRange({ days: 4, start: '2026-02-27', end: '2026-03-02' }, 2026)).toBe(
      '27 February to 2 March'
    );
    expect(streakRange({ days: 4, start: '2025-12-30', end: '2026-01-02' }, 2026)).toBe(
      '30 December 2025 to 2 January'
    );
  });
});

describe('heat levels', () => {
  it('splits the days with reading into quartiles', () => {
    const days = [1, 2, 3, 4, 5, 6, 7, 8].map(m => day('2026-01-01', m));
    expect(heatThresholds(days)).toEqual([3 * MIN, 5 * MIN, 7 * MIN]);
    const t = heatThresholds(days);
    expect(heatLevel(undefined, t)).toBe(0);
    expect(heatLevel(day('2026-01-01', 0, 0), t)).toBe(0);
    expect(heatLevel(day('2026-01-01', 1), t)).toBe(1);
    expect(heatLevel(day('2026-01-01', 3), t)).toBe(2);
    expect(heatLevel(day('2026-01-01', 5), t)).toBe(3);
    expect(heatLevel(day('2026-01-01', 8), t)).toBe(4);
  });

  it('gives a day of page turns without timed reading the first level', () => {
    const t = heatThresholds([]);
    expect(t).toEqual([Infinity, Infinity, Infinity]);
    expect(heatLevel(day('2026-01-01', 0, 3), t)).toBe(1);
  });
});

describe('buildHeatmap', () => {
  it('lays the year out in Monday-first weeks', () => {
    // 1 January 2026 is a Thursday: three padding days lead the first week.
    const map = buildHeatmap(2026, [day('2026-01-01', 30), day('2026-12-31', 5)], '2026-11-09');
    expect(map.weeks).toHaveLength(53);
    for (const week of map.weeks) expect(week).toHaveLength(7);
    const first = map.weeks[0]!;
    expect(first.map(c => c.inYear)).toEqual([false, false, false, true, true, true, true]);
    expect(first[0]!.date).toBe('2025-12-29');
    expect(first[3]).toMatchObject({ date: '2026-01-01', level: 4, activeMs: 30 * MIN });
    const cells = map.weeks.flat().filter(c => c.inYear);
    expect(cells).toHaveLength(365);
    expect(cells.at(-1)).toMatchObject({ date: '2026-12-31', future: true });
    expect(map.months.map(m => m.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ]);
    expect(map.months[0]!.column).toBe(0);
    expect(map.busiest?.date).toBe('2026-01-01');
  });

  it('covers a leap year starting on a Monday', () => {
    const map = buildHeatmap(2024, [], '2026-01-01');
    expect(map.weeks[0]![0]!.date).toBe('2024-01-01');
    expect(map.weeks.flat().filter(c => c.inYear)).toHaveLength(366);
    expect(map.busiest).toBeNull();
  });
});

describe('summaries', () => {
  it('describes the heatmap in one sentence', () => {
    const empty = stats();
    expect(describeHeatmap(empty, buildHeatmap(2026, [], empty.today))).toBe(
      'No reading recorded in 2026.'
    );
    const days = [day('2026-03-08', 90), day('2026-03-09', 20)];
    const full = stats({ days, yearTotals: { ...totals, daysRead: 2, activeMs: 110 * MIN } });
    expect(describeHeatmap(full, buildHeatmap(2026, days, full.today))).toBe(
      'Reading in 2026: 2 days with reading, 1 h 50 min in all. The busiest day was Sunday 8 March 2026 with 1 h 30 min.'
    );
  });

  it('finds the busiest month', () => {
    expect(busiestMonth(Array<number>(12).fill(0))).toBeNull();
    const months = Array<number>(12).fill(0);
    months[2] = 5;
    months[9] = 9;
    expect(busiestMonth(months)).toEqual({ label: 'October', activeMs: 9 });
  });
});
