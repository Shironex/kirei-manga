import { describe, expect, it } from 'vitest';

import type { SeriesSummary } from '@/lib/library';

import { gridMetrics, visibleRows } from './gridLayout';
import { continueShelf, foldText, readingState, shelve } from './shelf';

let nextId = 1;
function series(over: Partial<SeriesSummary> = {}): SeriesSummary {
  const id = nextId++;
  return {
    id,
    rootId: 1,
    title: `Series ${id}`,
    path: `/m/${id}`,
    cover: null,
    chapterCount: 10,
    missingCount: 0,
    completedCount: 0,
    lastReadAt: null,
    newCount: 0,
    continueChapterId: id * 100,
    missing: false,
    addedAt: id,
    updatedAt: id,
    ...over,
  };
}

const unread = series({ title: 'Żółta łódź podwodna', addedAt: 50 });
const reading = series({ title: 'Wiedźma z Bieszczad', completedCount: 3, lastReadAt: 2000 });
const recent = series({ title: 'Kōri no Niwa', completedCount: 1, lastReadAt: 3000, newCount: 2 });
const finished = series({ title: 'Lato', completedCount: 10, lastReadAt: 1000 });
const opened = series({ title: 'Zima', completedCount: 0, lastReadAt: 500 });
const all = [unread, reading, recent, finished, opened];

describe('readingState', () => {
  it('splits unread, reading and finished', () => {
    expect(readingState(unread)).toBe('unread');
    expect(readingState(reading)).toBe('reading');
    expect(readingState(finished)).toBe('finished');
    expect(readingState(opened)).toBe('reading');
  });
});

describe('search', () => {
  it('folds Polish and Japanese diacritics both ways', () => {
    expect(foldText('Żółta łódź')).toBe('zolta lodz');
    expect(foldText('Kōri')).toBe('kori');
    const find = (search: string) =>
      shelve(all, { filter: 'all', sort: 'title', search }).map(s => s.title);
    expect(find('zolta LODZ')).toEqual(['Żółta łódź podwodna']);
    expect(find('łódź')).toEqual(['Żółta łódź podwodna']);
    expect(find('wiedzma')).toEqual(['Wiedźma z Bieszczad']);
    expect(find('niwa kori')).toEqual(['Kōri no Niwa']);
    expect(find('  ')).toHaveLength(all.length);
    expect(find('nothing like this')).toEqual([]);
  });
});

describe('shelve', () => {
  it('filters by reading state', () => {
    const titles = (filter: 'reading' | 'unread' | 'finished') =>
      shelve(all, { filter, sort: 'title', search: '' }).map(s => s.title);
    expect(titles('reading')).toEqual(['Kōri no Niwa', 'Wiedźma z Bieszczad', 'Zima']);
    expect(titles('unread')).toEqual(['Żółta łódź podwodna']);
    expect(titles('finished')).toEqual(['Lato']);
  });

  it('sorts titles with Polish collation', () => {
    const titles = shelve(all, { filter: 'all', sort: 'title', search: '' }).map(s => s.title);
    // Ż sorts after Z in Polish, not with it.
    expect(titles).toEqual([
      'Kōri no Niwa',
      'Lato',
      'Wiedźma z Bieszczad',
      'Zima',
      'Żółta łódź podwodna',
    ]);
  });

  it('sorts by last read, newest added and new chapters', () => {
    const ids = (sort: 'recent' | 'added' | 'new') =>
      shelve(all, { filter: 'all', sort, search: '' }).map(s => s.id);
    expect(ids('recent')).toEqual([recent.id, reading.id, finished.id, opened.id, unread.id]);
    expect(ids('added')[0]).toBe(unread.id);
    expect(ids('new')[0]).toBe(recent.id);
  });

  it('does not reorder the input', () => {
    const before = all.map(s => s.id);
    shelve(all, { filter: 'all', sort: 'recent', search: '' });
    expect(all.map(s => s.id)).toEqual(before);
  });
});

describe('continueShelf', () => {
  it('puts the most recently read series in the hero', () => {
    const shelf = continueShelf(all);
    expect(shelf.mode).toBe('continue');
    expect(shelf.hero?.id).toBe(recent.id);
    expect(shelf.also.map(s => s.id)).toEqual([reading.id, opened.id]);
  });

  it('offers the newest unread series when nothing is in progress', () => {
    const shelf = continueShelf([unread, finished, series({ addedAt: 1 })]);
    expect(shelf).toMatchObject({ mode: 'start', also: [] });
    expect(shelf.hero?.id).toBe(unread.id);
    expect(continueShelf([]).hero).toBeNull();
  });
});

describe('grid geometry', () => {
  const spec = { minTile: 150, gapX: 24, gapY: 32, caption: 70 };

  it('fits as many columns as the minimum width allows', () => {
    expect(gridMetrics(1092, spec)).toMatchObject({ columns: 6 });
    expect(gridMetrics(1020, spec).columns).toBe(6);
    expect(gridMetrics(1019, spec).columns).toBe(5);
    expect(gridMetrics(100, spec).columns).toBe(1);
    const m = gridMetrics(1092, spec);
    expect(m.tileWidth * 6 + 24 * 5).toBeCloseTo(1092);
    expect(m.stride).toBe(m.rowHeight + 32);
  });

  it('renders only the rows near the viewport', () => {
    const base = { viewport: 800, gridTop: 600, stride: 400, rows: 1700, overscan: 1 };
    expect(visibleRows({ ...base, scrollTop: 0 })).toEqual([0, 2]);
    expect(visibleRows({ ...base, scrollTop: 600 + 400 * 100 })).toEqual([99, 103]);
    expect(visibleRows({ ...base, scrollTop: 1e9 })).toEqual([1700, 1700]);
    expect(visibleRows({ ...base, rows: 0, scrollTop: 0 })).toEqual([0, 0]);
  });
});
