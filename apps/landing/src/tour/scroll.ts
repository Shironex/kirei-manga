/**
 * Turns the page scroll into tour progress. The stop sections' edges are
 * measured once and again on resize, font load and page load, so a scroll
 * event is arithmetic on scrollY with no layout reads.
 */
import { progressFromEdges } from './progress';

export interface TourScroll {
  /** The current progress, cheap enough to read every frame. */
  read(): number;
  /** Calls `listener` now and on every change; returns the unsubscribe. */
  subscribe(listener: (progress: number) => void): () => void;
}

export interface TourTracker extends TourScroll {
  scrollToStop(stop: number, smooth: boolean): void;
}

export function trackTour(
  tour: HTMLElement,
  sections: readonly HTMLElement[],
  active: MediaQueryList
): TourTracker {
  const listeners = new Set<(progress: number) => void>();
  let edges: number[] = [];
  let progress = 0;

  const update = () => {
    const next = active.matches ? progressFromEdges(window.scrollY, edges) : 0;
    if (next === progress) return;
    progress = next;
    for (const listener of listeners) listener(progress);
  };
  const measure = () => {
    const y = window.scrollY;
    edges = sections.map(section => section.getBoundingClientRect().top + y);
    const last = sections.at(-1);
    if (last) edges.push((edges.at(-1) ?? 0) + last.offsetHeight);
    update();
  };

  measure();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', measure, { passive: true });
  active.addEventListener('change', measure);
  new ResizeObserver(measure).observe(tour);
  void document.fonts?.ready.then(measure);
  if (document.readyState !== 'complete') window.addEventListener('load', measure, { once: true });

  return {
    read: () => progress,
    subscribe(listener) {
      listeners.add(listener);
      listener(progress);
      return () => listeners.delete(listener);
    },
    scrollToStop(stop, smooth) {
      const top = edges[Math.max(0, Math.min(sections.length - 1, Math.round(stop)))] ?? 0;
      window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
    },
  };
}
