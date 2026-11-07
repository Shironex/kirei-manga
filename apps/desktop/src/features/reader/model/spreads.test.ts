import { describe, expect, it } from 'vitest';

import { buildSpreads, isWide, type PageSize } from './spreads';

const page = (width: number, height: number): PageSize => ({ width, height });
const tall = page(1200, 1800);
const wide = page(2400, 1800);
const unknown: PageSize = { width: null, height: null };

/**
 * Page sizes shaped like real chapters: a scanlated chapter with a colour
 * spread in the middle, a volume rip with a credit page, and a chapter whose
 * headers carry no size.
 */
const FIXTURES = {
  plain: [tall, tall, tall, tall, tall],
  middleSpread: [tall, tall, tall, wide, tall, tall],
  spreadAfterCover: [tall, wide, tall, tall],
  credits: [tall, page(1200, 1800), tall, tall, tall, wide, tall, tall, page(800, 1100)],
  noHeaders: [unknown, unknown, unknown],
  square: [tall, page(1500, 1500), tall, tall],
};

describe('isWide', () => {
  it('treats a page at least as wide as tall as a spread', () => {
    expect(isWide(wide)).toBe(true);
    expect(isWide(page(1500, 1500))).toBe(true);
    expect(isWide(tall)).toBe(false);
  });

  it('treats a page without a size as narrow', () => {
    expect(isWide(unknown)).toBe(false);
    expect(isWide({ width: 1200, height: null })).toBe(false);
    expect(isWide({ width: 0, height: 0 })).toBe(false);
  });
});

describe('buildSpreads', () => {
  const cover = { detectSpreads: true, coverAlone: true, shift: false };

  it('shows the cover alone and pairs the rest', () => {
    expect(buildSpreads(FIXTURES.plain, cover)).toEqual([[0], [1, 2], [3, 4]]);
  });

  it('pairs from the first page when the cover is not alone', () => {
    expect(
      buildSpreads(FIXTURES.plain, { detectSpreads: true, coverAlone: false, shift: false })
    ).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('shows a wide page alone and restarts the pairing after it', () => {
    expect(buildSpreads(FIXTURES.middleSpread, cover)).toEqual([[0], [1, 2], [3], [4, 5]]);
  });

  it('never pairs a narrow page with a wide one', () => {
    expect(buildSpreads(FIXTURES.spreadAfterCover, cover)).toEqual([[0], [1], [2, 3]]);
    expect(buildSpreads(FIXTURES.square, cover)).toEqual([[0], [1], [2, 3]]);
  });

  it('moves the pairing by one with the shift', () => {
    expect(
      buildSpreads(FIXTURES.plain, { detectSpreads: true, coverAlone: true, shift: true })
    ).toEqual([[0], [1], [2, 3], [4]]);
    expect(
      buildSpreads(FIXTURES.plain, { detectSpreads: true, coverAlone: false, shift: true })
    ).toEqual([[0], [1, 2], [3, 4]]);
  });

  it('handles a volume with credits, a spread and an odd last page', () => {
    expect(buildSpreads(FIXTURES.credits, cover)).toEqual([[0], [1, 2], [3, 4], [5], [6, 7], [8]]);
  });

  it('pairs wide pages like any other with detection off', () => {
    expect(
      buildSpreads(FIXTURES.middleSpread, { detectSpreads: false, coverAlone: true, shift: false })
    ).toEqual([[0], [1, 2], [3, 4], [5]]);
  });

  it('pairs pages whose headers carry no size', () => {
    expect(buildSpreads(FIXTURES.noHeaders, cover)).toEqual([[0], [1, 2]]);
  });

  it('covers every page exactly once, in order, for every option', () => {
    for (const pages of Object.values(FIXTURES)) {
      for (const coverAlone of [true, false]) {
        for (const shift of [true, false]) {
          const flat = buildSpreads(pages, { detectSpreads: true, coverAlone, shift }).flat();
          expect(flat).toEqual(pages.map((_, i) => i));
        }
      }
    }
  });

  it('returns nothing for an empty chapter', () => {
    expect(buildSpreads([], cover)).toEqual([]);
  });
});
