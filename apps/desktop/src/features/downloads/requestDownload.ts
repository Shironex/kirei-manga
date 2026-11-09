/**
 * Downloads of MangaDex chapters for offline reading. The chapter rows of the
 * online series page call `requestDownload` from their Download action; the
 * downloads slice fills this module in. Until then every request answers
 * `unavailable`, and the rows say downloads are not ready yet.
 */

/** What became of a download request. */
export type DownloadRequest =
  { status: 'queued'; chapterIds: string[] } | { status: 'unavailable'; reason: string };

/** Whether the Download action is offered on chapter rows. */
export const DOWNLOADS_READY = false;

/** Queues MangaDex chapters (by chapter id) for download. */
export function requestDownload(chapterIds: readonly string[]): Promise<DownloadRequest> {
  void chapterIds;
  return Promise.resolve({ status: 'unavailable', reason: 'Downloads arrive in a later update.' });
}
