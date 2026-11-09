import { describe, expect, it } from 'vitest';

import { buildSpreads } from './spreads';
import { isTall, sliceStrip, SPLIT_OVERLAP } from './split';

describe('isTall', () => {
  it('counts pages at least twice as high as wide', () => {
    expect(isTall({ width: 800, height: 1600 })).toBe(true);
    expect(isTall({ width: 800, height: 12_000 })).toBe(true);
    expect(isTall({ width: 1200, height: 1800 })).toBe(false);
    expect(isTall({ width: null, height: null })).toBe(false);
    expect(isTall(undefined)).toBe(false);
  });

  it('trusts a measured ratio over the header', () => {
    expect(isTall({ width: 1200, height: 1800 }, 0.25)).toBe(true);
    expect(isTall({ width: null, height: null }, 0.4)).toBe(true);
  });
});

describe('sliceStrip', () => {
  it('leaves a strip that fits one screen whole', () => {
    expect(sliceStrip(0.5, { width: 400, height: 1000 }, 960)).toBeNull();
    expect(sliceStrip(0, { width: 400, height: 1000 }, 960)).toBeNull();
  });

  it('cuts a strip into overlapping screens, the last one flush with the bottom', () => {
    const slices = sliceStrip(800 / 8000, { width: 1200, height: 1000 }, 960);
    expect(slices).not.toBeNull();
    const { width, height, view, offsets } = slices!;
    expect([width, height, view]).toEqual([960, 9600, 1000]);
    expect(offsets[0]).toBe(0);
    expect(offsets[offsets.length - 1]).toBe(height - view);
    for (let part = 1; part < offsets.length; part += 1) {
      const step = offsets[part]! - offsets[part - 1]!;
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThanOrEqual(Math.round(view * (1 - SPLIT_OVERLAP)));
    }
  });

  it('uses the box width when it is under the cap', () => {
    expect(sliceStrip(0.25, { width: 500, height: 1000 }, 960)?.offsets).toEqual([0, 950, 1000]);
  });
});

describe('tall strips in double page mode', () => {
  it('show alone when splitting, so they are never paired', () => {
    const page = { width: 1200, height: 1800 };
    const strip = { width: 800, height: 8000 };
    const pages = [page, page, strip, page, page];
    const options = { detectSpreads: true, coverAlone: true, shift: false };
    expect(buildSpreads(pages, { ...options, tallAlone: true })).toEqual([[0], [1], [2], [3, 4]]);
    expect(buildSpreads(pages, options)).toEqual([[0], [1, 2], [3, 4]]);
  });
});
