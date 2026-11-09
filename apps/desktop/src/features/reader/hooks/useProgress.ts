import { useEffect, useRef } from 'react';

import { recordProgress } from '@/lib/library';
import { sendOnlineProgress, type OnlineChapterRef } from '@/features/online/onlineProgress';

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
 * Records the furthest page of a MangaDex chapter; see `sendOnlineProgress`
 * for what finishing it sends to MangaDex and AniList.
 */
export function useOnlineProgress(
  online: OnlineChapterRef | null,
  page: number | null,
  pageCount: number
): void {
  const reported = useRef<string | null>(null);
  useProgressReport(online?.chapterId ?? null, page, furthest =>
    online ? sendOnlineProgress(online, furthest, pageCount, reported) : Promise.resolve()
  );
}
