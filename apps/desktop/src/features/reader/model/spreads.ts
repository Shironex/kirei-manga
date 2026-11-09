/**
 * Double page layout: which pages share the screen.
 *
 * A page wider than it is tall is a spread scan (two pages printed as one
 * image), so it is shown alone. The rest pair up in reading order. The first
 * page is a cover and shows alone unless the reader turns that off, and the
 * one page shift moves the pairing by one for books whose spreads come out
 * misaligned (a missing credit page, an extra insert).
 */

import { isTall } from './split';

/** The size a page is known to have, from its image header. */
export interface PageSize {
  width: number | null;
  height: number | null;
}

/** Width over height at or above which a page counts as a spread scan. */
export const WIDE_RATIO = 1.0;

export interface SpreadOptions {
  /** Show pages wider than tall on their own. Off pairs every page. */
  detectSpreads: boolean;
  /** Show the first page on its own. */
  coverAlone: boolean;
  /** Shift the pairing by one page. */
  shift: boolean;
  /** Show tall strips on their own, for splitting them into parts. */
  tallAlone?: boolean;
}

export const DEFAULT_SPREAD_OPTIONS: SpreadOptions = {
  detectSpreads: true,
  coverAlone: true,
  shift: false,
};

/** A page with no size in its header is treated as a normal, narrow page. */
export function isWide(page: PageSize | undefined): boolean {
  if (!page?.width || !page.height) return false;
  return page.width / page.height >= WIDE_RATIO;
}

/**
 * Groups page indexes into what each screen shows, in reading order. Every
 * group holds one or two indexes; together they cover every page once.
 */
export function buildSpreads(pages: readonly PageSize[], options: SpreadOptions): number[][] {
  const spreads: number[][] = [];
  let index = 0;
  if (options.coverAlone && pages.length > 0) {
    spreads.push([0]);
    index = 1;
  }
  // The shift shows one more page alone, so every later pair starts one later.
  if (options.shift && index < pages.length) {
    spreads.push([index]);
    index += 1;
  }
  const alone = (page: PageSize | undefined) =>
    (options.detectSpreads && isWide(page)) || (options.tallAlone === true && isTall(page));
  while (index < pages.length) {
    const next = pages[index + 1];
    if (alone(pages[index]) || next === undefined || alone(next)) {
      spreads.push([index]);
      index += 1;
    } else {
      spreads.push([index, index + 1]);
      index += 2;
    }
  }
  return spreads;
}
