import { describe, expect, it } from 'vitest';

import type { SeriesSummary } from '@/lib/library';
import { EMPTY_QUERY, itemRef, type ShelfItem } from '@/lib/shelf';

import {
  completeQuery,
  coverage,
  describeQuery,
  isEmptyQuery,
  moveItem,
  resolveItems,
} from './model';
import { isWanted, refKey } from './shelfStore';

const overview = {
  tags: [
    { id: 1, name: 'Action', count: 3 },
    { id: 2, name: 'Drama', count: 1 },
  ],
  collections: [
    {
      id: 7,
      name: 'Favourites',
      position: 0,
      count: 2,
      coverRefId: null,
      preview: [],
      updatedAt: 0,
    },
  ],
};

function item(over: Partial<ShelfItem>): ShelfItem {
  return {
    refId: 1,
    seriesId: null,
    source: 'local',
    remoteId: null,
    title: 'Title',
    coverFile: null,
    addedAt: 0,
    ...over,
  };
}

describe('describeQuery', () => {
  it('says every series for an empty query', () => {
    expect(describeQuery(EMPTY_QUERY, overview)).toBe('Every series');
    expect(isEmptyQuery(EMPTY_QUERY)).toBe(true);
  });

  it('reads as one plain sentence', () => {
    const query = completeQuery({
      tags: [1, 2],
      tagMode: 'all',
      collections: [7],
      status: ['reading'],
      minUnread: 3,
      source: 'local',
      addedWithinDays: 30,
    });
    expect(describeQuery(query, overview)).toBe(
      'Tagged Action and Drama, in Favourites, reading, at least 3 unread, on disk, added last 30 days'
    );
    expect(isEmptyQuery(query)).toBe(false);
  });

  it('leaves out tags that are gone and every status at once', () => {
    const query = completeQuery({
      tags: [1, 99],
      status: ['unread', 'reading', 'finished'],
      wantToRead: true,
    });
    expect(describeQuery(query, overview)).toBe('Tagged Action, in Want to Read');
  });
});

describe('resolveItems', () => {
  const ash = { id: 4, title: 'Ash' } as SeriesSummary;
  const byId = new Map([[4, ash]]);

  it('keeps list order and drops series the catalogue no longer has', () => {
    const remote = item({ seriesId: null, source: 'mangadex', remoteId: 'u-1', title: 'Online' });
    const out = resolveItems([remote, item({ seriesId: 4 }), item({ seriesId: 5 })], byId);
    expect(out.local).toEqual([ash]);
    expect(out.remote).toEqual([remote]);
  });
});

describe('moveItem', () => {
  it('moves and clamps', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 9, 0)).toEqual(['a', 'b']);
  });
});

describe('coverage', () => {
  it('tells all, some and none apart', () => {
    expect(coverage(3, 3)).toBe('all');
    expect(coverage(1, 3)).toBe('some');
    expect(coverage(0, 3)).toBe('none');
    expect(coverage(0, 0)).toBe('none');
  });
});

describe('refs', () => {
  it('round trips a list item to the ref the commands take', () => {
    expect(itemRef(item({ seriesId: 4 }))).toEqual({ source: 'local', seriesId: 4 });
    expect(
      itemRef(item({ source: 'mangadex', remoteId: 'u-1', title: 'T', coverFile: 'https://x' }))
    ).toEqual({ source: 'mangadex', remoteId: 'u-1', title: 'T', coverFile: 'https://x' });
  });

  it('finds a series in Want to Read by local id or remote id', () => {
    const want = [
      item({ seriesId: 4 }),
      item({ seriesId: null, source: 'mangadex', remoteId: 'u-1' }),
    ];
    expect(isWanted(want, { source: 'local', seriesId: 4 })).toBe(true);
    expect(isWanted(want, { source: 'mangadex', remoteId: 'u-1' })).toBe(true);
    expect(isWanted(want, { source: 'local', seriesId: 5 })).toBe(false);
    expect(refKey({ source: 'mangadex', remoteId: 'u-1' })).toBe('r:mangadex:u-1');
  });
});
