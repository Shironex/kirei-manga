import type { CoverRef } from '@/lib/library';
import type { ReadingStats } from '@/lib/stats';

import { buildHeatmap, count, durationHeadline, formatDuration, type HeatLevel } from '../model';

/**
 * What the year in review card says, as plain data: drawCard paints it and
 * the stats page reads it for the card's accessible description. Pure, so
 * the wording is tested without a canvas.
 */

export interface CardTile {
  value: string;
  label: string;
}

export interface CardSeries {
  title: string;
  line: string;
  cover: CoverRef | null;
}

export interface CardModel {
  year: string;
  hero: { value: string; unit: string };
  tiles: CardTile[];
  /** Columns of seven levels, Monday first; null for padding days outside the year. */
  heat: (HeatLevel | null)[][];
  top: CardSeries[];
  /** The cover the card takes its colours from: the most read series with one. */
  themeCover: CoverRef | null;
}

/** How many series the card shows. */
export const CARD_SERIES = 3;

export function buildCardModel(stats: ReadingStats): CardModel {
  const totals = stats.yearTotals;
  const streak = stats.yearLongestStreak.days;
  const heatmap = buildHeatmap(stats.year, stats.days, stats.today);
  const top = stats.topSeries.slice(0, CARD_SERIES).map(series => ({
    title: series.title,
    line:
      series.chaptersFinished > 0
        ? `${formatDuration(series.activeMs)}, ${count(series.chaptersFinished, 'chapter')}`
        : formatDuration(series.activeMs),
    cover: series.cover,
  }));
  const headline = durationHeadline(totals.activeMs);
  return {
    year: String(stats.year),
    hero: { value: headline.value, unit: `${headline.unit} read` },
    tiles: [
      { value: totals.chaptersFinished.toLocaleString('en'), label: 'chapters finished' },
      { value: totals.pagesTurned.toLocaleString('en'), label: 'pages turned' },
      { value: totals.daysRead.toLocaleString('en'), label: 'days with reading' },
      { value: streak.toLocaleString('en'), label: 'day streak' },
    ],
    heat: heatmap.weeks.map(week => week.map(cell => (cell.inYear ? cell.level : null))),
    top,
    themeCover: stats.topSeries.find(series => series.cover)?.cover ?? null,
  };
}

/** The card in one paragraph, for screen readers (the canvas itself is an image). */
export function describeCard(model: CardModel): string {
  const tiles = model.tiles.map(t => `${t.value} ${t.label}`).join(', ');
  const top = model.top.length
    ? ` Most read: ${model.top.map(s => `${s.title} (${s.line})`).join('; ')}.`
    : '';
  return `KireiManga, ${model.year} in review: ${model.hero.value} ${model.hero.unit}, ${tiles}.${top}`;
}

/** File name the save dialog suggests. */
export function cardFileName(year: string): string {
  return `kireimanga-${year}-in-review.png`;
}

/**
 * Cuts `text` to fit `maxWidth` with an ellipsis, measuring with `measure`
 * (the canvas' measureText in the app). Keeps whole characters.
 */
export function fitText(text: string, maxWidth: number, measure: (s: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  const chars = Array.from(text);
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(`${chars.slice(0, mid).join('').trimEnd()}…`) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low === 0 ? '…' : `${chars.slice(0, low).join('').trimEnd()}…`;
}

/**
 * Splits a title over at most `lines` lines, word by word, ellipsizing the
 * last line. A single word longer than a line is cut too.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  lines: number,
  measure: (s: string) => number
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? '';
    const next = current ? `${current} ${word}` : word;
    if (measure(next) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) out.push(current);
    current = word;
    if (out.length === lines - 1) {
      current = words.slice(i).join(' ');
      break;
    }
  }
  if (current) out.push(current);
  return out.slice(0, lines).map(line => fitText(line, maxWidth, measure));
}
