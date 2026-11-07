import { useEffect, useRef } from 'react';

import { recordProgress } from '@/lib/library';

/** Page changes settle before they are written. */
const RECORD_DELAY_MS = 500;

/**
 * Records the furthest page on screen for a library chapter, so a double page
 * spread ending on the last page completes the chapter. Writes after the
 * reader settles and once more when the reader closes.
 */
export function useProgress(chapterId: number | null, page: number | null): void {
  const latest = useRef<number | null>(null);
  const written = useRef<number | null>(null);

  useEffect(() => {
    if (chapterId === null || page === null) return;
    latest.current = page;
    const timer = setTimeout(() => {
      written.current = page;
      recordProgress(chapterId, page).catch(() => {
        // Progress is retried on the next page change.
      });
    }, RECORD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [chapterId, page]);

  useEffect(() => {
    return () => {
      const page = latest.current;
      if (chapterId !== null && page !== null && page !== written.current) {
        recordProgress(chapterId, page).catch(() => {});
      }
    };
  }, [chapterId]);
}
