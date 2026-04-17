import { useCallback } from 'react';
import { useDownloadsStore, type DownloadStatus } from '@/stores/downloads-store';

type UiStatus = 'idle' | DownloadStatus;

interface DownloadChapterResult {
  status: UiStatus;
  progress: { current: number; total: number } | null;
  error: string | null;
  download: () => void;
}

/**
 * Thin wrapper over `useDownloadsStore` scoped to a single chapter. The store
 * holds download state globally so it survives component remounts — before,
 * the hook kept status in local `useState` and a user who navigated away and
 * back could see the Download icon on an already-queued chapter and trigger
 * a duplicate request (the backend would dedupe, but the UI flickered).
 *
 * `initiallyDownloaded=true` means the DB already says is_downloaded=1 for
 * this chapter — we surface that as `'complete'` and skip the store unless
 * a fresh progress event lands. Download is a no-op while already in flight.
 */
export function useDownloadChapter(
  chapterId: string,
  mangadexSeriesId: string,
  initiallyDownloaded = false
): DownloadChapterResult {
  const entry = useDownloadsStore(s => s.entries[chapterId]);
  const requestDownload = useDownloadsStore(s => s.requestDownload);

  // Prefer live store state — if we have any entry, it's authoritative.
  // Otherwise fall back to the DB-derived flag.
  const status: UiStatus = entry?.status ?? (initiallyDownloaded ? 'complete' : 'idle');
  const progress =
    entry && entry.status === 'downloading' && entry.total > 0
      ? { current: entry.current, total: entry.total }
      : null;
  const error = entry?.error ?? null;

  const download = useCallback(() => {
    // Belt-and-braces: the store drops the request on duplicates too, but
    // if the DB already says downloaded (entry absent, status='complete')
    // we don't want to re-emit just because the store has no record.
    if (status === 'complete' || status === 'downloading') return;
    requestDownload(chapterId, mangadexSeriesId);
  }, [chapterId, mangadexSeriesId, requestDownload, status]);

  return { status, progress, error, download };
}
