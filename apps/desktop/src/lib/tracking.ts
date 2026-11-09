import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * AniList tracking commands (src-tauri/src/tracking.rs). The access token
 * never reaches the renderer: it lives in the OS keychain and the Rust side.
 * See docs/tracking.md.
 */

/** Mirrors `kirei_anilist::Viewer`. */
export interface Viewer {
  id: number;
  name: string;
  avatar: string | null;
  siteUrl: string | null;
}

/** Mirrors `AccountStatus` in tracking.rs. */
export interface AccountStatus {
  /** This build carries an AniList client id. */
  configured: boolean;
  signedIn: boolean;
  viewer: Viewer | null;
  expiresAt: number | null;
  /** A sign in is waiting for the browser. */
  signingIn: boolean;
  redirectUri: string;
  rateLimit: number;
}

/** AniList's `MediaListStatus`. */
export type ListStatus = 'CURRENT' | 'PLANNING' | 'COMPLETED' | 'DROPPED' | 'PAUSED' | 'REPEATING';

export const LIST_STATUS_LABEL: Record<ListStatus, string> = {
  CURRENT: 'Reading',
  PLANNING: 'Planning',
  COMPLETED: 'Completed',
  PAUSED: 'Paused',
  DROPPED: 'Dropped',
  REPEATING: 'Rereading',
};

export const LIST_STATUSES = Object.keys(LIST_STATUS_LABEL) as ListStatus[];

/** Mirrors `kirei_anilist::ListEntry`. */
export interface ListEntry {
  id: number;
  status: ListStatus | null;
  progress: number;
  score: number;
  repeat: number;
  updatedAt: number | null;
}

/** Mirrors `kirei_anilist::Media`. */
export interface Media {
  id: number;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
    userPreferred: string | null;
  };
  synonyms: string[];
  format: string | null;
  status: string | null;
  chapters: number | null;
  volumes: number | null;
  startYear: number | null;
  cover: string | null;
  siteUrl: string | null;
  isAdult: boolean;
  listEntry: ListEntry | null;
}

export interface SearchPage {
  media: Media[];
  hasNextPage: boolean;
}

/** Mirrors `kirei_library::TrackerLink`. */
export interface TrackerLink {
  seriesKey: string;
  mediaId: number;
  source: 'manual' | 'mangadex';
  title: string | null;
  totalChapters: number | null;
  remoteProgress: number | null;
  remoteStatus: ListStatus | null;
  remoteScore: number | null;
  remoteCheckedAt: number | null;
  syncedProgress: number | null;
  createdAt: number;
  updatedAt: number;
}

/** Mirrors `kirei_library::QueuedUpdate`. */
export interface QueuedUpdate {
  id: number;
  mediaId: number;
  progress: number | null;
  status: ListStatus | null;
  score: number | null;
  attempts: number;
  lastError: string | null;
  revision: number;
  nextAttemptAt: number;
  syncedProgress: number | null;
}

/** Mirrors `SeriesTracking` in tracking.rs. */
export interface SeriesTracking {
  seriesKey: string;
  link: TrackerLink | null;
  localProgress: number | null;
  queued: QueuedUpdate | null;
}

/** Mirrors `kirei_library::QueueSummary`. */
export interface QueueSummary {
  pending: number;
  blocked: number;
  failed: number;
  nextAttemptAt: number | null;
  lastError: string | null;
}

/** A series by where it lives: the local library or MangaDex. */
export type SeriesRef = { kind: 'local'; id: number } | { kind: 'mangadex'; id: string };

export const TRACKING_CHANGED_EVENT = 'tracking:changed';

/** The best title to show, in the same order as `MediaTitle::display` in Rust. */
export function mediaTitle(media: Pick<Media, 'title'>): string {
  const t = media.title;
  return (
    [t.userPreferred, t.english, t.romaji, t.native].find(v => v && v.trim() !== '') ?? 'Untitled'
  );
}

export function getAccount(): Promise<AccountStatus> {
  return invoke<AccountStatus>('anilist_status');
}

/** Opens AniList in the browser and resolves once the redirect came back (or rejects). */
export function signIn(): Promise<AccountStatus> {
  return invoke<AccountStatus>('anilist_sign_in');
}

export function cancelSignIn(): Promise<void> {
  return invoke('anilist_cancel_sign_in');
}

export function signOut(): Promise<AccountStatus> {
  return invoke<AccountStatus>('anilist_sign_out');
}

export function searchManga(query: string, page = 1): Promise<SearchPage> {
  return invoke<SearchPage>('tracking_search', { query, page });
}

export function getSeriesTracking(series: SeriesRef): Promise<SeriesTracking> {
  return invoke<SeriesTracking>('tracking_series', { series });
}

export function linkSeries(series: SeriesRef, media: Media): Promise<SeriesTracking> {
  return invoke<SeriesTracking>('tracking_link', {
    series,
    mediaId: media.id,
    title: mediaTitle(media),
    totalChapters: media.chapters,
    origin: 'manual',
  });
}

/**
 * Links a MangaDex series to the AniList entry MangaDex itself names (the
 * series' `al` link), so no search is needed. Recorded with origin
 * `mangadex`, which a manual link later replaces.
 */
export function linkFromMangaDex(
  mangaId: string,
  anilistId: number,
  title: string
): Promise<SeriesTracking> {
  return invoke<SeriesTracking>('tracking_link', {
    series: { kind: 'mangadex', id: mangaId },
    mediaId: anilistId,
    title,
    totalChapters: null,
    origin: 'mangadex',
  });
}

/** Whether a series page should link on its own: AniList id known, no link yet. */
export function needsMangaDexLink(
  anilistId: number | null,
  state: Pick<SeriesTracking, 'link'> | null
): anilistId is number {
  return anilistId !== null && state !== null && state.link === null;
}

/**
 * Queues AniList progress after a chapter is finished. Rust drops it (and
 * resolves `false`) when tracking is off, auto update is off or the series
 * is not linked.
 */
export function reportProgress(series: SeriesRef, progress: number): Promise<boolean> {
  return invoke<boolean>('tracking_report_progress', { series, progress });
}

/**
 * AniList progress for a finished chapter number such as `12` or `12.5`:
 * the whole chapters read. `null` for a oneshot or anything below one.
 */
export function progressFromChapter(number: string | null): number | null {
  if (!number) return null;
  const value = Math.floor(Number(number));
  return Number.isFinite(value) && value >= 1 ? value : null;
}

export function unlinkSeries(series: SeriesRef): Promise<SeriesTracking> {
  return invoke<SeriesTracking>('tracking_unlink', { series });
}

export function syncSeries(series: SeriesRef): Promise<SeriesTracking> {
  return invoke<SeriesTracking>('tracking_sync', { series });
}

export function updateEntry(
  series: SeriesRef,
  change: { status?: ListStatus; score?: number }
): Promise<SeriesTracking> {
  return invoke<SeriesTracking>('tracking_update_entry', {
    series,
    status: change.status ?? null,
    score: change.score ?? null,
  });
}

export function getQueue(): Promise<QueueSummary> {
  return invoke<QueueSummary>('tracking_queue');
}

export function retryQueue(): Promise<QueueSummary> {
  return invoke<QueueSummary>('tracking_retry');
}

export function onTrackingChanged(handler: () => void): Promise<UnlistenFn> {
  return listen(TRACKING_CHANGED_EVENT, () => handler());
}

/**
 * What the series page says about progress on both sides. `null` when there
 * is nothing worth a line (not linked, or AniList not read yet).
 */
export function describeProgress(state: SeriesTracking): string | null {
  const link = state.link;
  if (!link || link.remoteCheckedAt === null) return null;
  const local = state.localProgress;
  const remote = link.remoteProgress;
  if (remote === null) return 'Not on your AniList list yet.';
  const total = link.totalChapters ? ` of ${link.totalChapters}` : '';
  if (local === null || local === remote) return `Chapter ${remote}${total} on AniList.`;
  if (remote > local) {
    return `AniList is ahead: chapter ${remote}${total} there, ${local} read here.`;
  }
  return `Chapter ${remote}${total} on AniList, ${local} read here.`;
}

/** One line about the update queue for the Settings screen. */
export function describeQueue(queue: QueueSummary, now = Date.now()): string {
  const parts: string[] = [];
  if (queue.pending > 0) {
    const due = queue.nextAttemptAt;
    const when =
      due === null || due <= now
        ? 'now'
        : `in ${Math.max(1, Math.round((due - now) / 60_000))} min`;
    parts.push(`${queue.pending} waiting, next ${when}`);
  }
  if (queue.blocked > 0) parts.push(`${queue.blocked} held until you sign in`);
  if (queue.failed > 0) parts.push(`${queue.failed} refused by AniList`);
  if (parts.length === 0) return 'Everything is on AniList.';
  const line = `${parts.join(', ')}.`;
  return queue.lastError ? `${line} Last error: ${queue.lastError}` : line;
}
