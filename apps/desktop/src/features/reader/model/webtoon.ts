import { ratioOf } from './fit';
import { isTall } from './split';
import type { PageSize } from './spreads';

/** Share of the pages with a known size that must be tall strips. */
export const WEBTOON_SHARE = 0.5;

/**
 * True when a chapter reads as a webtoon: at least half of its pages with a
 * known size are tall strips. Uses only the header sizes `page_meta` already
 * returns, so it costs nothing at open. Covers and credit pages of normal
 * shape do not tip it, and a chapter with no sizes at all is not one.
 */
export function looksLikeWebtoon(pages: readonly PageSize[]): boolean {
  let sized = 0;
  let tall = 0;
  for (const page of pages) {
    if (!page.width || !page.height) continue;
    sized += 1;
    if (isTall(page)) tall += 1;
  }
  return sized > 0 && tall >= sized * WEBTOON_SHARE;
}

/** Where every strip of a webtoon chapter sits in the scroll column. */
export interface StripLayout {
  /** Top of each page in CSS pixels. */
  tops: number[];
  heights: number[];
  /** Height of all pages together, gaps included. */
  total: number;
}

/**
 * Lays the pages out one under another at `width`, so the whole chapter has
 * its final height before a single page loads and the scrollbar never jumps.
 */
export function layoutStrips(
  pages: readonly PageSize[],
  width: number,
  gap = 0,
  /** Width over height measured from loaded images, by page index. */
  measured: ReadonlyMap<number, number> = new Map()
): StripLayout {
  const tops: number[] = [];
  const heights: number[] = [];
  let y = 0;
  pages.forEach((page, index) => {
    const height = Math.round(width / ratioOf(page, measured.get(index)));
    tops.push(y);
    heights.push(height);
    y += height + gap;
  });
  return { tops, heights, total: pages.length > 0 ? y - gap : 0 };
}

/** Index of the page under the vertical position `y`, clamped to the chapter. */
export function pageAt(layout: StripLayout, y: number): number {
  const { tops } = layout;
  if (tops.length === 0) return 0;
  let low = 0;
  let high = tops.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((tops[mid] ?? 0) <= y) low = mid;
    else high = mid - 1;
  }
  return low;
}

/**
 * Pages to keep in the DOM for a scroll position: the ones on screen plus
 * `overscan` screens above and below, so fast scrolling rarely shows a gap.
 */
export function visibleRange(
  layout: StripLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 1
): { start: number; end: number } {
  if (layout.tops.length === 0) return { start: 0, end: -1 };
  const margin = viewportHeight * overscan;
  const start = pageAt(layout, Math.max(0, scrollTop - margin));
  const end = pageAt(layout, scrollTop + viewportHeight + margin);
  return { start, end };
}

/**
 * The page a reader is on: the one crossing a line a third of the way down the
 * screen, where the eye rests while scrolling, not the one at the very top.
 */
export function focusedPage(
  layout: StripLayout,
  scrollTop: number,
  viewportHeight: number
): number {
  return pageAt(layout, scrollTop + viewportHeight / 3);
}
