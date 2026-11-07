import type { ReaderMode } from './prefs';
import { buildSpreads, type PageSize, type SpreadOptions } from './spreads';

/**
 * What each screen of the paged modes shows: one page each in single mode,
 * spreads in double mode. Webtoon has no screens (it scrolls), so it gets one
 * page per entry, which keeps page numbers and the scrubber uniform.
 */
export function buildScreens(
  pages: readonly PageSize[],
  mode: ReaderMode,
  options: SpreadOptions
): number[][] {
  if (mode === 'double') return buildSpreads(pages, options);
  return pages.map((_, index) => [index]);
}

/** Position of the reader in the paged modes. */
export interface PagedPosition {
  /** First page of the screen on show. */
  page: number;
  /** Past the last screen: the end of chapter card is up. */
  atEnd: boolean;
}

function screenIndex(screens: readonly number[][], page: number): number {
  const found = screens.findIndex(group => group.includes(page));
  return found >= 0 ? found : Math.max(0, screens.length - 1);
}

/** The screen that holds `page`, as its first page. */
export function snapToScreen(screens: readonly number[][], page: number): number {
  return screens[screenIndex(screens, page)]?.[0] ?? 0;
}

/**
 * Moves `delta` screens. Going forward from the last screen opens the end
 * card; going back from the end card returns to the last screen.
 */
export function stepScreen(
  screens: readonly number[][],
  position: PagedPosition,
  delta: number
): PagedPosition {
  if (screens.length === 0) return { page: 0, atEnd: false };
  const last = screens.length - 1;
  const firstOf = (at: number) => screens[at]?.[0] ?? 0;
  if (position.atEnd) {
    return delta < 0 ? { page: firstOf(last), atEnd: false } : position;
  }
  const target = screenIndex(screens, position.page) + delta;
  if (target > last) return { page: firstOf(last), atEnd: true };
  return { page: firstOf(Math.max(0, target)), atEnd: false };
}

/** Furthest page on show, the one progress records. */
export function lastVisiblePage(screens: readonly number[][], position: PagedPosition): number {
  const group = screens[screenIndex(screens, position.page)];
  return group?.[group.length - 1] ?? 0;
}
