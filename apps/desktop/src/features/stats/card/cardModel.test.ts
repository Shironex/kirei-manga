import { describe, expect, it } from 'vitest';

import type { CoverRef } from '@/lib/library';
import type { ReadingStats, SeriesReading } from '@/lib/stats';

import { buildCardModel, cardFileName, describeCard, fitText, wrapText } from './cardModel';

const MIN = 60_000;
/** Every character is 10 units wide. */
const measure = (s: string) => Array.from(s).length * 10;

const cover = (hash: string): CoverRef => ({
  hash,
  path: `/covers/${hash}.jpg`,
  width: 400,
  height: 600,
  palette: { h: 25, c: 0.15, swatches: [], fallback: false },
});

function series(title: string, minutes: number, chapters: number, c: CoverRef | null) {
  return {
    seriesId: 1,
    title,
    cover: c,
    activeMs: minutes * MIN,
    pagesTurned: 10,
    chaptersFinished: chapters,
    sessions: 1,
    daysRead: 1,
  } satisfies SeriesReading;
}

function stats(): ReadingStats {
  const totals = {
    activeMs: 5000 * MIN,
    sessions: 120,
    pagesTurned: 12_345,
    chaptersFinished: 321,
    daysRead: 88,
    seriesRead: 9,
  };
  return {
    year: 2026,
    today: '2026-11-09',
    years: [2026],
    allTime: totals,
    yearTotals: totals,
    currentStreak: { days: 3, start: '2026-11-07', end: '2026-11-09' },
    longestStreak: { days: 21, start: '2026-02-01', end: '2026-02-21' },
    yearLongestStreak: { days: 21, start: '2026-02-01', end: '2026-02-21' },
    days: [
      {
        date: '2026-02-01',
        activeMs: 60 * MIN,
        pagesTurned: 100,
        chaptersFinished: 3,
        sessions: 2,
      },
    ],
    months: Array<number>(12).fill(0),
    topSeries: [
      series('No Cover Yet', 900, 0, null),
      series('Moonlit Archive', 600, 40, cover('a')),
      series('Ember', 300, 1, cover('b')),
      series('Fourth', 100, 2, cover('c')),
    ],
    longestSessionMs: 0,
  };
}

describe('buildCardModel', () => {
  it('puts the year totals in words and keeps three series', () => {
    const model = buildCardModel(stats());
    expect(model.year).toBe('2026');
    expect(model.hero).toEqual({ value: '83', unit: 'hours read' });
    expect(model.tiles).toEqual([
      { value: '321', label: 'chapters finished' },
      { value: '12,345', label: 'pages turned' },
      { value: '88', label: 'days with reading' },
      { value: '21', label: 'day streak' },
    ]);
    expect(model.top.map(s => s.title)).toEqual(['No Cover Yet', 'Moonlit Archive', 'Ember']);
    expect(model.top.map(s => s.line)).toEqual(['15 h', '10 h, 40 chapters', '5 h, 1 chapter']);
    // Colours come from the most read series that has a cover.
    expect(model.themeCover?.hash).toBe('a');
    expect(model.heat).toHaveLength(53);
    expect(model.heat[0]?.slice(0, 3)).toEqual([null, null, null]);
  });

  it('describes the card for screen readers', () => {
    expect(describeCard(buildCardModel(stats()))).toBe(
      'KireiManga, 2026 in review: 83 hours read, 321 chapters finished, 12,345 pages turned, 88 days with reading, 21 day streak. Most read: No Cover Yet (15 h); Moonlit Archive (10 h, 40 chapters); Ember (5 h, 1 chapter).'
    );
  });

  it('suggests a file name per year', () => {
    expect(cardFileName('2026')).toBe('kireimanga-2026-in-review.png');
  });
});

describe('fitting text', () => {
  it('leaves text that fits and ellipsizes text that does not', () => {
    expect(fitText('Ember', 50, measure)).toBe('Ember');
    expect(fitText('Moonlit Archive', 80, measure)).toBe('Moonlit…');
    expect(fitText('Moonlit', 5, measure)).toBe('…');
  });

  it('wraps titles word by word and ellipsizes the last line', () => {
    expect(wrapText('The Moonlit Archive of Small Hours', 120, 2, measure)).toEqual([
      'The Moonlit',
      'Archive of\u2026',
    ]);
    expect(wrapText('Ember', 120, 3, measure)).toEqual(['Ember']);
    expect(wrapText('Supercalifragilistic', 100, 2, measure)).toEqual(['Supercali…']);
    expect(wrapText('', 100, 2, measure)).toEqual([]);
  });
});
