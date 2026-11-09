import { describe, expect, it } from 'vitest';

import type { SeriesSummary } from '@/lib/library';

import { matchPositions, prepare, queryWords, scoreSearchable } from './fuzzy';
import { chapterEntries, searchEntries, seriesEntries, shelfEntries, staticEntries } from './index';
import { pushRecent, RECENT_LIMIT, resolveRecents } from './recents';
import type { PaletteItem } from './types';

function series(id: number, title: string): SeriesSummary {
  return {
    id,
    rootId: 1,
    title,
    path: `/m/${id}`,
    cover: null,
    chapterCount: 12,
    missingCount: 0,
    completedCount: 0,
    lastReadAt: null,
    newCount: 0,
    continueChapterId: null,
    missing: false,
    addedAt: id,
    updatedAt: id,
  };
}

const score = (query: string, title: string, extra = '') =>
  scoreSearchable(queryWords(query), prepare(title, extra));

describe('fuzzy scoring', () => {
  it('misses when a word is absent', () => {
    expect(score('xyz', 'Naruto')).toBe(-1);
    expect(score('naruto bleach', 'Naruto')).toBe(-1);
  });

  it('folds accents on both sides', () => {
    expect(score('zolta', 'Żółta łódź podwodna')).toBeGreaterThan(0);
    expect(score('kori', 'Kōri no Niwa')).toBeGreaterThan(0);
  });

  it('ranks prefix over word start over middle over spread letters', () => {
    const prefix = score('na', 'Naruto');
    const wordStart = score('na', 'One Naruto');
    const middle = score('ar', 'Naruto');
    const spread = score('nrt', 'Naruto');
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(spread);
    expect(spread).toBeGreaterThan(0);
  });

  it('matches words in any order and counts extra keywords at half weight', () => {
    expect(score('ninja naruto', 'Naruto ninja')).toBeGreaterThan(0);
    expect(score('theme', 'Appearance', 'theme colour')).toBeGreaterThan(0);
    expect(score('theme', 'Appearance', 'theme colour')).toBeLessThan(score('theme', 'Theme'));
  });

  it('does not match a single stray letter in order', () => {
    expect(score('q', 'Naruto')).toBe(-1);
  });

  it('gives positions for highlighting, none when folding shifts them', () => {
    expect(matchPositions(['nar'], 'Naruto')).toEqual([0, 1, 2]);
    expect(matchPositions(['x'], 'Naruto')).toEqual([]);
    expect(matchPositions(['e'], 'é')).toEqual([]);
  });
});

describe('palette index', () => {
  it('finds series, settings and actions', () => {
    const all = [
      ...seriesEntries([series(1, 'One Piece'), series(2, 'Berserk')]),
      ...staticEntries(() => []),
    ];
    expect(searchEntries(all, 'berserk', 5)[0]?.item.id).toBe('series:2');
    expect(searchEntries(all, 'rescan', 5)[0]?.item.id).toBe('action:rescan');
    expect(searchEntries(all, 'cover colours', 5)[0]?.item.section).toBe('settings');
    expect(searchEntries(all, '   ', 5)).toEqual([]);
  });

  it('memoises the series index on the array', () => {
    const list = [series(1, 'A')];
    expect(seriesEntries(list)).toBe(seriesEntries(list));
    expect(seriesEntries([...list])).not.toBe(seriesEntries(list));
  });

  it('indexes readable chapters under their series', () => {
    const chapter = (id: number, number: number, missing = false) => ({
      id,
      path: `/c/${id}`,
      kind: 'zip' as const,
      title: null,
      volume: null,
      number,
      pageCount: 20,
      language: null,
      scanGroup: null,
      missing,
      error: null,
      progress: null,
    });
    const entries = chapterEntries({
      id: 7,
      title: 'Berserk',
      chapters: [chapter(70, 11), chapter(71, 12, true)],
    });
    expect(entries.map(e => e.item.id)).toEqual(['chapter:70']);
    expect(searchEntries(entries, 'berserk 11', 3)[0]?.item.target).toEqual({
      type: 'chapter',
      seriesId: 7,
      chapterId: 70,
    });
  });

  it('opens fast on a 5000 series library', () => {
    const library = Array.from({ length: 5000 }, (_, i) =>
      series(i + 1, `Series ${i} ${['Dawn', 'Night', 'Blade', 'Garden'][i % 4]} of the ${i * 7}`)
    );
    const fixed = staticEntries(() => []);

    // A loaded CI runner can stall any single run, so each figure is the median of several
    // runs and the bounds leave wide headroom. A real regression is many times slower.
    const median = (runs: number[]) =>
      [...runs].sort((a, b) => a - b)[runs.length >> 1] ?? Infinity;
    const opening: number[] = [];
    const perKeyRuns: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      // Opening: the index is built once (the palette host does it before the first Ctrl+K)
      // and a cold first query runs against it.
      const t0 = performance.now();
      const index = seriesEntries(library);
      searchEntries(index, 'blade garden', 8);
      opening.push(performance.now() - t0);

      // Typing: every further keystroke only scores.
      const t1 = performance.now();
      for (const q of ['b', 'bl', 'bla', 'blad', 'blade 4', 'nrth']) {
        searchEntries(index, q, 8);
        searchEntries(fixed, q, 5);
      }
      perKeyRuns.push((performance.now() - t1) / 6);
    }
    const open = median(opening);
    const perKey = median(perKeyRuns);

    console.info(
      `palette 5000 series (median of 5): open ${open.toFixed(1)} ms, per key ${perKey.toFixed(1)} ms`
    );
    expect(open).toBeLessThan(250);
    expect(perKey).toBeLessThan(100);
  });
});

describe('recents', () => {
  const item = (id: string, seriesId = 1): PaletteItem => ({
    id,
    section: 'series',
    title: id,
    target: { type: 'series', seriesId },
  });

  it('moves a repeat to the front and caps the list', () => {
    let list: PaletteItem[] = [];
    for (let i = 0; i < RECENT_LIMIT + 3; i += 1) list = pushRecent(list, item(`s${i}`));
    expect(list).toHaveLength(RECENT_LIMIT);
    list = pushRecent(list, item('s5'));
    expect(list[0]?.id).toBe('s5');
    expect(list.filter(r => r.id === 's5')).toHaveLength(1);
  });

  it('never stores a custom target', () => {
    const custom: PaletteItem = {
      id: 'x',
      section: 'online',
      title: 'x',
      target: { type: 'custom', run: () => {} },
    };
    expect(pushRecent([], custom)).toEqual([]);
  });

  it('drops series that are gone and refreshes fixed items', () => {
    const fresh: PaletteItem = {
      id: 'page:/library',
      section: 'pages',
      title: 'Library',
      keys: ['Ctrl', '1'],
      target: { type: 'page', to: '/library' },
    };
    const stale = { ...fresh, keys: undefined };
    const out = resolveRecents(
      [item('series:9', 9), item('series:1', 1), stale],
      new Map([[fresh.id, fresh]]),
      id => id === 1
    );
    expect(out.map(r => r.id)).toEqual(['series:1', 'page:/library']);
    expect(out[1]?.keys).toEqual(['Ctrl', '1']);
  });
});

describe('shelf entries', () => {
  const overview = {
    wantCount: 2,
    collections: [
      {
        id: 3,
        name: 'Summer shelf',
        position: 0,
        count: 4,
        coverRefId: null,
        preview: [],
        updatedAt: 0,
      },
    ],
    tags: [{ id: 5, name: 'Cosy', count: 1 }],
    filters: [
      {
        id: 8,
        name: 'Unread isekai',
        query: {
          tags: [],
          tagMode: 'any' as const,
          excludeTags: [],
          collections: [],
          wantToRead: null,
          status: [],
          minUnread: null,
          languages: [],
          source: null,
          addedWithinDays: null,
          sort: 'title' as const,
        },
        pinned: true,
        position: 0,
        updatedAt: 0,
      },
    ],
  };

  it('finds collections, filters, tags and Want to Read by name', () => {
    const entries = shelfEntries(overview);
    const find = (q: string) => searchEntries(entries, q, 5).map(h => h.item.id);
    expect(find('summer')).toEqual(['collection:3']);
    expect(find('isekai')).toEqual(['filter:8']);
    expect(find('cosy')).toEqual(['tag:5']);
    expect(find('want')).toEqual(['collection:want']);
    expect(find('later')).toEqual(['collection:want']);
  });

  it('is memoised on the overview, and recents drop what is gone', () => {
    const entries = shelfEntries(overview);
    expect(shelfEntries(overview)).toBe(entries);
    const current = new Map(entries.map(e => [e.item.id, e.item]));
    const gone = { ...entries[1]!.item, id: 'collection:99' };
    const shown = resolveRecents([entries[1]!.item, gone], current, () => true);
    expect(shown.map(i => i.id)).toEqual(['collection:3']);
  });
});
