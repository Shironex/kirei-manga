import { useEffect, useRef } from 'react';

import { recordProgress } from '@/lib/library';
import { recordOnlineProgress } from '@/lib/online';

/** Page changes settle before they are written. */
const RECORD_DELAY_MS = 500;

/**
 * Hands the furthest page on screen to `report` after the reader settles and
 * once more when the reader closes. `key` names the chapter; `null` reports
 * nothing. A failed report is retried on the next page change.
 */
export function useProgressReport(
  key: string | null,
  page: number | null,
  report: (page: number) => Promise<unknown>
): void {
  const latest = useRef<number | null>(null);
  const written = useRef<number | null>(null);
  const writer = useRef(report);
  useEffect(() => {
    writer.current = report;
  });

  useEffect(() => {
    if (key === null || page === null) return;
    latest.current = page;
    const timer = setTimeout(() => {
      written.current = page;
      writer.current(page).catch(() => {});
    }, RECORD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, page]);

  useEffect(() => {
    return () => {
      const page = latest.current;
      if (key !== null && page !== null && page !== written.current) {
        writer.current(page).catch(() => {});
      }
    };
  }, [key]);
}

/**
 * Records the furthest page on screen for a library chapter, so a double page
 * spread ending on the last page completes the chapter.
 */
export function useProgress(chapterId: number | null, page: number | null): void {
  useProgressReport(chapterId === null ? null : String(chapterId), page, furthest =>
    chapterId === null ? Promise.resolve() : recordProgress(chapterId, furthest)
  );
}

/**
 * Records the furthest page of a MangaDex chapter. Reaching the last page
 * marks it read, locally at once and on MangaDex with the next sync.
 */
export function useOnlineProgress(
  online: { mangaId: string; chapterId: string } | null,
  page: number | null,
  pageCount: number
): void {
  useProgressReport(online?.chapterId ?? null, page, furthest =>
    online
      ? recordOnlineProgress(
          online.mangaId,
          online.chapterId,
          furthest,
          pageCount > 0 && furthest >= pageCount - 1
        )
      : Promise.resolve()
  );
}
