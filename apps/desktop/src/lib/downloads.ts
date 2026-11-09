import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * Offline downloads (src-tauri/src/downloads.rs, crates/kirei-download).
 * Chapters are written as CBZ with ComicInfo.xml into the downloads folder,
 * which is a library root, so they appear in the library on their own.
 *
 * The online screens (#43) call `requestDownload` from a chapter row and
 * `autoDownloadNew` from the follow feed; everything else is for the
 * Downloads page.
 */

export type DownloadState = 'queued' | 'downloading' | 'paused' | 'done' | 'failed';
export type DownloadQuality = 'data' | 'dataSaver';

/** Mirrors `kirei_download::DownloadJob`. */
export interface DownloadJob {
  id: number;
  chapterId: string;
  mangaId: string | null;
  seriesTitle: string | null;
  /** `Vol. 2 Ch. 11 · Title`, once the chapter's details are in. */
  chapterLabel: string | null;
  language: string | null;
  quality: DownloadQuality;
  state: DownloadState;
  pagesDone: number;
  pagesTotal: number | null;
  error: string | null;
  /** Where the archive goes (or went). */
  path: string | null;
  /** Queued by the follow feed rather than by hand. */
  auto: boolean;
  addedAt: number;
  updatedAt: number;
}

/** Mirrors `kirei_download::DownloadEvent`. */
export type DownloadEvent = { kind: 'changed'; job: DownloadJob } | { kind: 'removed'; id: number };

/** Mirrors `downloads::DownloadFolder`. */
export interface DownloadFolder {
  path: string;
  inLibrary: boolean;
  error: string | null;
}

export const DOWNLOADS_EVENT = 'downloads:changed';

/**
 * Queues MangaDex chapters for download, with the data saver setting in
 * effect. Chapters already queued or downloaded are skipped; failed ones are
 * retried. Resolves with the jobs added.
 */
export function requestDownload(chapterIds: string[]): Promise<DownloadJob[]> {
  return invoke<DownloadJob[]>('downloads_enqueue', { chapterIds });
}

/**
 * New chapters of followed series, for the follow feed. Queued only when the
 * `downloads.autoFollows` setting is on (checked in Rust); resolves with what
 * was queued, empty when the setting is off.
 */
export function autoDownloadNew(followedChapterIds: string[]): Promise<DownloadJob[]> {
  return invoke<DownloadJob[]>('downloads_auto', { chapterIds: followedChapterIds });
}

export function listDownloads(): Promise<DownloadJob[]> {
  return invoke<DownloadJob[]>('downloads_list');
}

/** Pauses jobs by id, or every job when no ids are given. */
export function pauseDownloads(ids?: number[]): Promise<void> {
  return invoke('downloads_pause', { ids: ids ?? null });
}

/** Resumes paused and failed jobs by id, or all of them. */
export function resumeDownloads(ids?: number[]): Promise<void> {
  return invoke('downloads_resume', { ids: ids ?? null });
}

/** Cancels jobs by id (or all), deleting their unfinished pages. */
export function cancelDownloads(ids?: number[]): Promise<void> {
  return invoke('downloads_cancel', { ids: ids ?? null });
}

/** Removes finished jobs from the list; the archives stay in the library. */
export function clearFinishedDownloads(): Promise<number> {
  return invoke<number>('downloads_clear_finished');
}

export function getDownloadFolder(): Promise<DownloadFolder> {
  return invoke<DownloadFolder>('downloads_folder');
}

export function openDownloadFolder(): Promise<void> {
  return invoke('open_downloads_folder');
}

export function onDownloadsChanged(handler: (event: DownloadEvent) => void): Promise<UnlistenFn> {
  return listen<DownloadEvent>(DOWNLOADS_EVENT, event => handler(event.payload));
}

/** The job list after an event, oldest first. */
export function applyDownloadEvent(jobs: DownloadJob[], event: DownloadEvent): DownloadJob[] {
  if (event.kind === 'removed') {
    return jobs.filter(job => job.id !== event.id);
  }
  const index = jobs.findIndex(job => job.id === event.job.id);
  if (index === -1) {
    return [...jobs, event.job].sort((a, b) => a.id - b.id);
  }
  const next = jobs.slice();
  next[index] = event.job;
  return next;
}

/** 0 to 1, for the progress bar. */
export function downloadProgress(job: DownloadJob): number {
  if (job.state === 'done') return 1;
  if (!job.pagesTotal) return 0;
  return Math.min(1, job.pagesDone / job.pagesTotal);
}

/** The title line of a job: series, else a placeholder until details are in. */
export function jobTitle(job: DownloadJob): string {
  return job.seriesTitle ?? 'MangaDex chapter';
}

/** The status line under a job. */
export function describeJob(job: DownloadJob): string {
  const pages = job.pagesTotal ? `${job.pagesDone} of ${job.pagesTotal} pages` : null;
  switch (job.state) {
    case 'queued':
      return pages && job.pagesDone > 0 ? `Waiting, ${pages}` : 'Waiting';
    case 'downloading':
      return pages ?? 'Starting';
    case 'paused':
      return pages ? `Paused, ${pages}` : 'Paused';
    case 'done':
      return 'In your library';
    case 'failed':
      return job.error ? `Failed: ${job.error}` : 'Failed';
  }
}

/** Jobs still to finish come first, finished ones after. */
export function isActive(job: DownloadJob): boolean {
  return job.state !== 'done';
}
