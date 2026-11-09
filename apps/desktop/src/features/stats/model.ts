import type { ReadingDay, ReadingStats, Streak } from '@/lib/stats';

/**
 * Pure helpers behind the stats page and the year in review card: durations,
 * dates and the heatmap grid. Dates are `YYYY-MM-DD` strings in the reader's
 * time zone (the library fixes the day when it records), so everything here
 * works on calendar days in UTC and never on local `Date` arithmetic, which
 * would shift across daylight saving changes.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY_MS = 86_400_000;

export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** `0 min`, `45 min`, `3 h 20 min`, `142 h` (minutes are dropped from 100 h up). */
export function formatDuration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours >= 100 || rest === 0) return `${hours.toLocaleString('en')} h`;
  return `${hours} h ${rest} min`;
}

/** The headline number of a duration with its unit spelled out: `{ value: '42', unit: 'hours' }`. */
export function durationHeadline(ms: number): { value: string; unit: string } {
  const minutes = Math.max(0, Math.round(ms / MINUTE));
  if (minutes < 60) return { value: String(minutes), unit: minutes === 1 ? 'minute' : 'minutes' };
  const hours = ms / HOUR;
  const value =
    hours < 10 ? String(Math.round(hours * 10) / 10) : Math.round(hours).toLocaleString('en');
  return { value, unit: value === '1' ? 'hour' : 'hours' };
}

/** `1 day`, `12 days`. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en')} ${n === 1 ? one : many}`;
}

/** Day number (days since 1970-01-01) of a `YYYY-MM-DD` date. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
}

/** `YYYY-MM-DD` of a day number. */
export function isoDate(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

function parts(date: string): { year: number; month: number; day: number; weekday: number } {
  const at = new Date(dayNumber(date) * DAY_MS);
  return {
    year: at.getUTCFullYear(),
    month: at.getUTCMonth(),
    day: at.getUTCDate(),
    weekday: at.getUTCDay(),
  };
}

/** `Sunday 8 March 2026`. */
export function longDate(date: string): string {
  const p = parts(date);
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month]} ${p.year}`;
}

/** `8 March`, with the year when it is not `year`. */
export function shortDate(date: string, year?: number): string {
  const p = parts(date);
  const base = `${p.day} ${MONTHS[p.month]}`;
  return year === undefined || p.year === year ? base : `${base} ${p.year}`;
}

/** `8 to 14 March`, `28 February to 3 March`, or one date for a one-day run. */
export function streakRange(streak: Streak, year?: number): string | null {
  if (!streak.start || !streak.end) return null;
  if (streak.start === streak.end) return shortDate(streak.start, year);
  const a = parts(streak.start);
  const b = parts(streak.end);
  if (a.year === b.year && a.month === b.month) {
    return `${a.day} to ${shortDate(streak.end, year)}`;
  }
  return `${shortDate(streak.start, a.year === b.year ? b.year : year)} to ${shortDate(streak.end, year)}`;
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatCell {
  date: string;
  /** False for the padding days before 1 January and after 31 December. */
  inYear: boolean;
  /** After today: nothing could have been read yet. */
  future: boolean;
  activeMs: number;
  pagesTurned: number;
  level: HeatLevel;
}

export interface Heatmap {
  /** Columns of seven days, Monday first. */
  weeks: HeatCell[][];
  /** Column where each month starts, for the labels above the grid. */
  months: { label: string; column: number }[];
  /** The active time at which levels 2, 3 and 4 start. */
  thresholds: [number, number, number];
  busiest: ReadingDay | null;
}

/** Level 1 to 4 by quartile of the days with reading, so a light reader still gets a full scale. */
export function heatThresholds(days: Pick<ReadingDay, 'activeMs'>[]): [number, number, number] {
  const values = days
    .map(d => d.activeMs)
    .filter(v => v > 0)
    .sort((a, b) => a - b);
  if (values.length === 0) return [Infinity, Infinity, Infinity];
  const at = (q: number) => values[Math.min(values.length - 1, Math.floor(q * values.length))]!;
  return [at(0.25), at(0.5), at(0.75)];
}

export function heatLevel(
  day: Pick<ReadingDay, 'activeMs' | 'pagesTurned'> | undefined,
  thresholds: [number, number, number]
): HeatLevel {
  if (!day || (day.activeMs <= 0 && day.pagesTurned <= 0)) return 0;
  const [two, three, four] = thresholds;
  if (day.activeMs >= four) return 4;
  if (day.activeMs >= three) return 3;
  if (day.activeMs >= two) return 2;
  return 1;
}

/** The year as a grid of weeks (Monday first), with each day's level. */
export function buildHeatmap(year: number, days: ReadingDay[], today: string): Heatmap {
  const byDate = new Map(days.map(d => [d.date, d]));
  const thresholds = heatThresholds(days);
  const first = dayNumber(`${year}-01-01`);
  const last = dayNumber(`${year}-12-31`);
  const todayNumber = dayNumber(today);
  // Monday on or before 1 January (getUTCDay: Sunday is 0).
  const lead = (parts(`${year}-01-01`).weekday + 6) % 7;
  const start = first - lead;
  const weeks: HeatCell[][] = [];
  const months: Heatmap['months'] = [];
  for (let day = start; day <= last; day += 7) {
    const column: HeatCell[] = [];
    for (let i = 0; i < 7; i++) {
      const n = day + i;
      const date = isoDate(n);
      const entry = byDate.get(date);
      const inYear = n >= first && n <= last;
      column.push({
        date,
        inYear,
        future: n > todayNumber,
        activeMs: entry?.activeMs ?? 0,
        pagesTurned: entry?.pagesTurned ?? 0,
        level: inYear ? heatLevel(entry, thresholds) : 0,
      });
      if (inYear && parts(date).day === 1) {
        months.push({ label: MONTHS[parts(date).month]!.slice(0, 3), column: weeks.length });
      }
    }
    weeks.push(column);
  }
  const busiest = days.reduce<ReadingDay | null>(
    (best, d) => (best === null || d.activeMs > best.activeMs ? d : best),
    null
  );
  return { weeks, months, thresholds, busiest };
}

/** One sentence for assistive tech: what the heatmap shows. */
export function describeHeatmap(stats: ReadingStats, heatmap: Heatmap): string {
  const { daysRead, activeMs } = stats.yearTotals;
  if (daysRead === 0) return `No reading recorded in ${stats.year}.`;
  const busiest = heatmap.busiest
    ? ` The busiest day was ${longDate(heatmap.busiest.date)} with ${formatDuration(heatmap.busiest.activeMs)}.`
    : '';
  return `Reading in ${stats.year}: ${count(daysRead, 'day')} with reading, ${formatDuration(activeMs)} in all.${busiest}`;
}

/** The month with the most reading, or null when there was none. */
export function busiestMonth(months: number[]): { label: string; activeMs: number } | null {
  let best = -1;
  months.forEach((ms, i) => {
    if (ms > 0 && (best < 0 || ms > (months[best] ?? 0))) best = i;
  });
  return best < 0 ? null : { label: MONTHS[best]!, activeMs: months[best] ?? 0 };
}

/** Average active time per session, 0 without sessions. */
export function averageSession(stats: ReadingStats): number {
  const { activeMs, sessions } = stats.yearTotals;
  return sessions > 0 ? activeMs / sessions : 0;
}

/** True when the year has nothing to show. */
export function isEmptyYear(stats: ReadingStats): boolean {
  return stats.yearTotals.sessions === 0;
}
