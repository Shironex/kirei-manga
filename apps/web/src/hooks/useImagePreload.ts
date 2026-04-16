import { useEffect } from 'react';

/**
 * Module-scoped dedupe set so React StrictMode double-mounts (and route
 * remounts within the same session) don't trigger redundant network requests
 * for already-warmed images.
 */
const preloaded = new Set<string>();

/**
 * Eagerly preload `ahead` images starting at `currentIndex` from `urls`.
 * Skips URLs already requested in this session.
 */
export function useImagePreload(urls: string[], currentIndex: number, ahead = 3): void {
  useEffect(() => {
    if (urls.length === 0) return;
    const start = Math.max(0, currentIndex);
    const end = Math.min(urls.length, start + ahead + 1);
    for (let i = start; i < end; i += 1) {
      const url = urls[i];
      if (!url || preloaded.has(url)) continue;
      preloaded.add(url);
      const img = new Image();
      img.src = url;
    }
  }, [urls, currentIndex, ahead]);
}
