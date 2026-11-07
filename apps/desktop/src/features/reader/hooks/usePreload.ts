import { useEffect } from 'react';

/**
 * Warms the webview's image cache for the pages the reader will show next, so
 * a page turn finds the bitmap ready instead of starting a request. The
 * backend reads these pages ahead already; this saves the fetch and decode.
 */
export function usePreload(urls: readonly string[]): void {
  const key = urls.join('\n');
  useEffect(() => {
    if (!key) return;
    // Not cancelled on change: the next window overlaps this one, and a
    // finished request is what makes the next turn instant.
    for (const url of key.split('\n')) {
      const image = new Image();
      image.decoding = 'async';
      image.src = url;
    }
  }, [key]);
}
