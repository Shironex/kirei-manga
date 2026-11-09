import { describe, expect, it } from 'vitest';

import { EMPTY_FILTERS, nextTagState, PAGE_SIZE, toggle, toQuery } from './search';

describe('toQuery', () => {
  it('sends nothing extra for empty filters and searches in the reader languages', () => {
    expect(toQuery(EMPTY_FILTERS)).toEqual({
      title: null,
      status: [],
      demographic: [],
      includedTags: [],
      excludedTags: [],
      languages: { kind: 'preferences' },
      order: null,
      limit: PAGE_SIZE,
      offset: 0,
    });
  });

  it('splits tags, orders titles up and everything else down', () => {
    const query = toQuery(
      {
        ...EMPTY_FILTERS,
        title: '  frieren ',
        tags: { a: 'include', b: 'exclude' },
        order: 'title',
        anyLanguage: true,
      },
      30
    );
    expect(query.title).toBe('frieren');
    expect(query.includedTags).toEqual(['a']);
    expect(query.excludedTags).toEqual(['b']);
    expect(query.order).toEqual(['title', 'asc']);
    expect(query.languages).toEqual({ kind: 'any' });
    expect(query.offset).toBe(30);
    expect(toQuery({ ...EMPTY_FILTERS, order: 'rating' }).order).toEqual(['rating', 'desc']);
  });
});

describe('filter helpers', () => {
  it('cycles a tag through include, exclude and off', () => {
    expect(nextTagState(undefined)).toBe('include');
    expect(nextTagState('include')).toBe('exclude');
    expect(nextTagState('exclude')).toBeUndefined();
  });

  it('toggles list members', () => {
    expect(toggle(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggle(['a', 'b'], 'a')).toEqual(['b']);
  });
});
