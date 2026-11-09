/**
 * Drawing resolution and the frame budget. The Canvas dpr range is the
 * ceiling, a pixel budget caps big windows (fill cost grows with pixels, not
 * with the ratio), and R3F's performance factor drops it further while a
 * slow GPU scrolls through the tour.
 */

export const DPR_RANGE: [number, number] = [1, 1.5];
/** R3F's performance factor: how far it may drop and how long it holds (ms). */
export const PERFORMANCE = { min: 0.6, debounce: 500 };
/** Drawing pixels per frame: about a 2560 by 1440 window at 1x. */
export const PIXEL_BUDGET = 3_700_000;
const DPR_FLOOR = 0.5;

export function adaptiveDpr(
  device: number,
  size: { width: number; height: number },
  factor = 1,
  budget = PIXEL_BUDGET
): number {
  const ceiling = Math.min(Math.max(DPR_RANGE[0], device), DPR_RANGE[1]);
  const area = size.width * size.height;
  const capped = area > 0 ? Math.min(ceiling, Math.sqrt(budget / area)) : ceiling;
  return Math.round(Math.max(DPR_FLOOR, capped * factor) * 100) / 100;
}

/** A gap longer than this (ms) is a paused loop or a hidden tab, not a frame. */
const PAUSE = 250;
/** Median frame time over this (ms) means the GPU cannot keep up (about 45 fps). */
export const SLOW_FRAME = 22;
/** Median frame time over this (ms) at the lowest quality gives up on the live scene. */
export const HOPELESS_FRAME = 50;
const WINDOW = 40;
const MIN_SAMPLES = 15;

/** A rolling median of frame times that ignores the first frame after a pause. */
export class FrameTimes {
  private readonly gaps: number[] = [];
  private last: number | null = null;

  tick(now: number, count = true): void {
    const gap = this.last === null ? null : now - this.last;
    this.last = now;
    if (gap === null || gap > PAUSE || !count) return;
    this.gaps.push(gap);
    if (this.gaps.length > WINDOW) this.gaps.shift();
  }

  median(): number | null {
    if (this.gaps.length < MIN_SAMPLES) return null;
    const sorted = [...this.gaps].sort((a, b) => a - b);
    return sorted[sorted.length >> 1] ?? null;
  }

  reset(): void {
    this.gaps.length = 0;
  }
}
