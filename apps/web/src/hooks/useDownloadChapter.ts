import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MangaDexEvents,
  type MangaDexDownloadChapterPayload,
  type MangaDexDownloadProgressEvent,
} from '@kireimanga/shared';
import { emitWithResponse, getSocket } from '@/lib/socket';

type DownloadStatus = 'idle' | 'downloading' | 'complete' | 'error';

interface DownloadChapterResult {
  status: DownloadStatus;
  progress: { current: number; total: number } | null;
  error: string | null;
  download: () => void;
}

/**
 * Manages the download lifecycle for a single chapter. Emits
 * `mangadex:download-chapter` on demand and streams progress from the
 * `mangadex:download-progress` broadcast, filtered by `chapterId`.
 *
 * If `initiallyDownloaded` is true the hook starts in `'complete'` state and
 * `download()` is a no-op.
 */
export function useDownloadChapter(
  chapterId: string,
  mangadexSeriesId: string,
  initiallyDownloaded = false
): DownloadChapterResult {
  const [status, setStatus] = useState<DownloadStatus>(initiallyDownloaded ? 'complete' : 'idle');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Keep `complete` status in sync when chapter states reload.
  useEffect(() => {
    if (initiallyDownloaded && status === 'idle') {
      setStatus('complete');
    }
  }, [initiallyDownloaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for progress events scoped to this chapter.
  useEffect(() => {
    const socket = getSocket();
    const handler = (event: MangaDexDownloadProgressEvent) => {
      if (event.chapterId !== chapterId) return;
      if (!mountedRef.current) return;

      if (event.status === 'downloading') {
        setStatus('downloading');
        setProgress({ current: event.current, total: event.total });
      } else if (event.status === 'complete') {
        setStatus('complete');
        setProgress(null);
        setError(null);
      } else if (event.status === 'error') {
        setStatus('error');
        setProgress(null);
        setError(event.error ?? 'Download failed');
      }
    };

    socket.on(MangaDexEvents.DOWNLOAD_PROGRESS, handler);
    return () => {
      socket.off(MangaDexEvents.DOWNLOAD_PROGRESS, handler);
    };
  }, [chapterId]);

  const download = useCallback(() => {
    if (status === 'complete' || status === 'downloading') return;

    setStatus('downloading');
    setError(null);
    setProgress(null);

    void emitWithResponse<MangaDexDownloadChapterPayload, { success: boolean; error?: string }>(
      MangaDexEvents.DOWNLOAD_CHAPTER,
      { chapterId, mangadexSeriesId }
    ).catch((err: unknown) => {
      if (!mountedRef.current) return;
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    });
  }, [chapterId, mangadexSeriesId, status]);

  return { status, progress, error, download };
}
