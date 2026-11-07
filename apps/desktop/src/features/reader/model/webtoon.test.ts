import { describe, expect, it } from 'vitest';

import { focusedPage, layoutStrips, pageAt, visibleRange } from './webtoon';

const strip = (width: number, height: number) => ({ width, height });

describe('layoutStrips', () => {
  it('stacks pages at the column width with their aspect kept', () => {
    const layout = layoutStrips([strip(800, 1600), strip(800, 800), strip(400, 1200)], 400, 10);
    expect(layout.heights).toEqual([800, 400, 1200]);
    expect(layout.tops).toEqual([0, 810, 1220]);
    expect(layout.total).toBe(2420);
  });

  it('uses a measured ratio over the header and 2:3 without either', () => {
    const measured = layoutStrips([{ width: null, height: null }], 200, 0, new Map([[0, 0.5]]));
    expect(measured.heights).toEqual([400]);
    expect(layoutStrips([{ width: null, height: null }], 200).heights).toEqual([300]);
  });

  it('is empty for no pages', () => {
    expect(layoutStrips([], 500)).toEqual({ tops: [], heights: [], total: 0 });
  });
});

describe('positions', () => {
  // 200 pages of 1000 px each, the size of a long webtoon chapter.
  const layout = layoutStrips(
    Array.from({ length: 200 }, () => strip(700, 1000)),
    700
  );

  it('finds the page under a position', () => {
    expect(pageAt(layout, 0)).toBe(0);
    expect(pageAt(layout, 999)).toBe(0);
    expect(pageAt(layout, 1000)).toBe(1);
    expect(pageAt(layout, 150_500)).toBe(150);
    expect(pageAt(layout, 1e9)).toBe(199);
    expect(pageAt(layout, -5)).toBe(0);
  });

  it('keeps only the pages near the screen', () => {
    expect(visibleRange(layout, 50_000, 900, 1)).toEqual({ start: 49, end: 51 });
    expect(visibleRange(layout, 0, 900, 1)).toEqual({ start: 0, end: 1 });
  });

  it('focuses the page a third of the way down the screen', () => {
    expect(focusedPage(layout, 9_800, 900)).toBe(10);
    expect(focusedPage(layout, 9_600, 900)).toBe(9);
  });
});
