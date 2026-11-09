import { recordOnlineProgress } from '@/lib/online';
import { progressFromChapter, reportProgress } from '@/lib/tracking';

/** A MangaDex chapter open in the reader. */
export interface OnlineChapterRef {
  mangaId: string;
  chapterId: string;
  /** The chapter number as MangaDex gives it (`12`, `12.5`), `null` for a oneshot. */
  number: string | null;
}

/**
 * Sends the furthest page read of a MangaDex chapter. The last page marks it
 * read (MangaDex sync picks that up) and queues the chapter number as AniList
 * progress, once per chapter: `reported` remembers the chapter already sent.
 * Rust drops the AniList part when the series is not linked or tracking is
 * off.
 */
export async function sendOnlineProgress(
  online: OnlineChapterRef,
  furthest: number,
  pageCount: number,
  reported: { current: string | null }
): Promise<void> {
  const finished = pageCount > 0 && furthest >= pageCount - 1;
  await recordOnlineProgress(online.mangaId, online.chapterId, furthest, finished);
  const progress = finished ? progressFromChapter(online.number) : null;
  if (progress === null || reported.current === online.chapterId) return;
  reported.current = online.chapterId;
  await reportProgress({ kind: 'mangadex', id: online.mangaId }, progress);
}
