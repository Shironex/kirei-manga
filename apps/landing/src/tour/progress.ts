/**
 * Tour progress counted in stops: 0 on the hero, 1 on the first feature and
 * so on, fractional in between. Pure maths, shared by the page and the island.
 */
import { LAST_STOP } from './stops';

export function clampProgress(progress: number, last = LAST_STOP): number {
  if (!Number.isFinite(progress)) return 0;
  return Math.min(last, Math.max(0, progress));
}

/**
 * Progress at scroll position `y`. `edges` holds the page top of every stop
 * section, then the bottom of the last one. A stop is reached as its
 * section's top meets the top of the window.
 */
export function progressFromEdges(y: number, edges: readonly number[]): number {
  const last = edges.length - 2;
  if (last < 1) return 0;
  for (let i = last; i >= 0; i--) {
    const top = edges[i] ?? 0;
    if (top > y) continue;
    const height = (edges[i + 1] ?? top) - top;
    return clampProgress(height > 0 ? i + (y - top) / height : i, last);
  }
  return 0;
}

export function nearestStop(progress: number, last = LAST_STOP): number {
  return Math.round(clampProgress(progress, last));
}

/** 0 at or below `min`, 1 at or above `max`, eased in between. */
export function smoothstep(x: number, min: number, max: number): number {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const k = (x - min) / (max - min);
  return k * k * (3 - 2 * k);
}

/**
 * Eases the part of progress between two stops so the camera lingers near
 * each stop and moves faster between them, without ever standing still.
 */
export function dwell(progress: number): number {
  const base = Math.floor(progress);
  const f = progress - base;
  const eased = f * f * (3 - 2 * f);
  return base + f * 0.25 + eased * 0.75;
}
