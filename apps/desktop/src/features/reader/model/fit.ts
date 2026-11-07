import type { Fit } from './prefs';

/** Widest a page is shown when fitted to width, in CSS pixels. */
export const FIT_WIDTH_CAP = 960;
/** Gap between the two pages of a spread. */
export const SPREAD_GAP = 2;

export interface FitPage {
  /** Width over height. */
  ratio: number;
  /** Height in CSS pixels at one image pixel per device pixel, when known. */
  naturalHeight: number | null;
}

export interface ScreenSize {
  /** Width of each page on screen, in reading order. */
  widths: number[];
  height: number;
}

/**
 * Sizes the pages of one screen. Every page of a screen shares one height so
 * a spread lines up. `screen` shows the whole screen in the box; `width`
 * fills the width (up to a comfortable cap per page) and `height` the height,
 * overflowing the other way; `original` shows one image pixel per device
 * pixel, falling back to `screen` when the size is unknown.
 */
export function fitScreen(
  pages: readonly FitPage[],
  box: { width: number; height: number },
  fit: Fit
): ScreenSize {
  if (pages.length === 0 || box.width <= 0 || box.height <= 0) return { widths: [], height: 0 };
  const gaps = SPREAD_GAP * (pages.length - 1);
  const sum = pages.reduce((total, page) => total + page.ratio, 0);
  const room = Math.max(1, box.width - gaps);
  const screen = Math.min(box.height, room / sum);
  let height: number;
  switch (fit) {
    case 'width':
      height = Math.min(room, FIT_WIDTH_CAP * pages.length) / sum;
      break;
    case 'height':
      height = box.height;
      break;
    case 'original':
      height = pages[0]?.naturalHeight ?? screen;
      break;
    default:
      height = screen;
  }
  return {
    widths: pages.map(page => Math.round(page.ratio * height)),
    height: Math.round(height),
  };
}

/** Width over height of a page, from a measured size, its header or 2:3. */
export function ratioOf(
  page: { width: number | null; height: number | null } | undefined,
  measured?: number
): number {
  if (measured && Number.isFinite(measured) && measured > 0) return measured;
  if (page?.width && page.height) return page.width / page.height;
  return 2 / 3;
}
