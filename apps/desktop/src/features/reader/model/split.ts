import { ratioOf } from './fit';
import type { PageSize } from './spreads';

/**
 * Tall strips: pages at least this many times taller than wide. The pipeline
 * uses the same ratio (`kirei_reader::TALL_RATIO`) to fit them to the box
 * width instead of the whole box when splitting is on.
 */
export const TALL_RATIO = 2;
/** Share of a screen the next part repeats, so the eye finds its place. */
export const SPLIT_OVERLAP = 0.05;

/** A page with no size is not tall; a measured ratio wins over the header. */
export function isTall(page: PageSize | undefined, measured?: number): boolean {
  if (measured === undefined && (!page?.width || !page.height)) return false;
  return ratioOf(page, measured) <= 1 / TALL_RATIO;
}

/** How a split strip is shown: its size on screen and where each part starts. */
export interface Slices {
  /** Size of the whole strip on screen, in CSS pixels. */
  width: number;
  height: number;
  /** Height of the window one part shows. */
  view: number;
  /** Top of each part within the strip; the last part ends at the bottom. */
  offsets: number[];
}

/**
 * Cuts a strip of `ratio` (width over height) into parts that each fill the
 * `box` height, at the box width up to `cap`. Neighbouring parts overlap by
 * `SPLIT_OVERLAP` of a screen, and the last one is aligned to the bottom so
 * no part shows empty space. `null` when the strip fits in one screen.
 */
export function sliceStrip(
  ratio: number,
  box: { width: number; height: number },
  cap: number
): Slices | null {
  if (!(ratio > 0) || box.width <= 0 || box.height <= 0) return null;
  const width = Math.round(Math.min(box.width, cap));
  const height = Math.round(width / ratio);
  const view = Math.round(box.height);
  if (height <= view + 1) return null;
  const step = Math.max(1, view * (1 - SPLIT_OVERLAP));
  const count = 1 + Math.ceil((height - view) / step);
  const offsets: number[] = [];
  for (let part = 0; part < count; part += 1)
    offsets.push(Math.round(Math.min(part * step, height - view)));
  return { width, height, view, offsets };
}
