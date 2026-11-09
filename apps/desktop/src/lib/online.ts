import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

import { isTauri } from './ipc';
import type { PageInfo } from './reader';

/**
 * MangaDex contract, mirrored from `kirei_mangadex` (camelCase serde) and the
 * online commands in `src-tauri/src/online/commands.rs`. Screens call these
 * wrappers, never `invoke` directly. Failures reject with an `OnlineError`
 * whose `kind` drives the offline, rate limit and session states.
 */

export type LocalizedText = Record<string, string>;
export type ContentRating = 'safe' | 'suggestive' | 'erotica' | 'pornographic';
export type PublicationStatus = 'ongoing' | 'completed' | 'hiatus' | 'cancelled';
export type Demographic = 'shounen' | 'shoujo' | 'josei' | 'seinen' | 'none';
export type ReadingStatus =
  'reading' | 'onHold' | 'planToRead' | 'dropped' | 'reReading' | 'completed';

export interface Tag {
  id: string;
  name: LocalizedText;
  group: 'genre' | 'theme' | 'format' | 'content' | string;
}

export interface Person {
  id: string;
  name: string;
}

export interface MangaCover {
  id: string;
  fileName: string;
  volume: string | null;
  locale: string | null;
}

export interface Manga {
  id: string;
  title: LocalizedText;
  altTitles: LocalizedText[];
  description: LocalizedText;
  originalLanguage: string;
  status: PublicationStatus | null;
  demographic: Demographic | null;
  contentRating: ContentRating;
  year: number | null;
  lastVolume: string | null;
  lastChapter: string | null;
  tags: Tag[];
  availableLanguages: string[];
  chapterNumbersResetOnNewVolume: boolean;
  links: Record<string, string>;
  cover: MangaCover | null;
  authors: Person[];
  artists: Person[];
  updatedAt: string | null;
}

export interface ScanlationGroup {
  id: string;
  name: string;
  website: string | null;
  official: boolean;
}

export interface Uploader {
  id: string;
  username: string | null;
}

export interface Chapter {
  id: string;
  mangaId: string | null;
  title: string | null;
  volume: string | null;
  chapter: string | null;
  pages: number;
  language: string;
  externalUrl: string | null;
  publishAt: string | null;
  readableAt: string | null;
  updatedAt: string | null;
  groups: ScanlationGroup[];
  uploader: Uploader | null;
}

export interface Page<T> {
  items: T[];
  offset: number;
  limit: number;
  total: number;
}

/** Mirrors `kirei_mangadex::LanguageOutcome`. */
export type LanguageOutcome =
  | { kind: 'preferred' }
  | {
      kind: 'mixed';
      preferredCount: number;
      fallbackCount: number;
      fallbackLanguages: string[];
    }
  | { kind: 'fallbackOnly'; languages: string[] }
  | { kind: 'nothing' };

export type SearchOrder =
  | 'relevance'
  | 'latestUploadedChapter'
  | 'followedCount'
  | 'rating'
  | 'title'
  | 'year'
  | 'createdAt'
  | 'updatedAt';

/** Mirrors `kirei_mangadex::SearchQuery`; ratings come from the settings. */
export interface SearchQuery {
  title?: string | null;
  includedTags?: string[];
  excludedTags?: string[];
  status?: PublicationStatus[];
  demographic?: Demographic[];
  languages?: { kind: 'preferences' } | { kind: 'any' } | { kind: 'exactly'; languages: string[] };
  order?: [SearchOrder, 'asc' | 'desc'] | null;
  limit?: number;
  offset?: number;
}

export type Health =
  | { state: 'online' }
  | { state: 'offline' }
  | { state: 'rateLimited'; until: number }
  | { state: 'blocked' };

export type Session = 'signedOut' | 'signedIn' | 'expired';

/** Mirrors `online::AccountView`. */
export interface Account {
  session: Session;
  username: string | null;
  clientId: string | null;
  health: Health;
  keychain: boolean;
}

export interface SeriesView {
  manga: Manga;
  following: boolean;
  readingStatus: ReadingStatus | null;
  singleLanguage: string | null;
  anilistId: number | null;
  cached: boolean;
}

export interface Marker {
  read: boolean;
  page: number;
  pending: boolean;
}

export interface ChaptersView {
  chapters: Chapter[];
  preferred: string;
  outcome: LanguageOutcome;
  singleLanguage: string | null;
  markers: Record<string, Marker>;
}

export interface FollowView {
  mangaId: string;
  manga: Manga | null;
  readingStatus: ReadingStatus | null;
}

export interface FeedEntry {
  chapter: Chapter;
  read: boolean;
  new: boolean;
}

export interface FeedGroup {
  mangaId: string;
  manga: Manga | null;
  chapters: FeedEntry[];
  latestAt: number;
  unread: number;
}

export interface FeedView {
  groups: FeedGroup[];
  lastRefresh: number | null;
}

export interface OpenedOnlineChapter {
  id: number;
  kind: 'online';
  pages: PageInfo[];
  chapter: Chapter;
  manga: Manga;
  startPage: number;
  next: Chapter | null;
  dataSaver: boolean;
}

export type OnlineErrorKind =
  | 'offline'
  | 'rateLimited'
  | 'blocked'
  | 'sessionExpired'
  | 'notSignedIn'
  | 'signIn'
  | 'notFound'
  | 'external'
  | 'invalid'
  | 'other';

export class OnlineError extends Error {
  constructor(
    readonly kind: OnlineErrorKind,
    message: string,
    readonly retryAfterSecs: number | null = null
  ) {
    super(message);
    this.name = 'OnlineError';
  }
}

/** Turns whatever a command rejected with into an `OnlineError`. */
export function toOnlineError(error: unknown): OnlineError {
  if (error instanceof OnlineError) return error;
  if (error && typeof error === 'object' && 'kind' in error && 'message' in error) {
    const raw = error as { kind: OnlineErrorKind; message: string; retryAfterSecs?: number | null };
    return new OnlineError(raw.kind, raw.message, raw.retryAfterSecs ?? null);
  }
  return new OnlineError('other', error instanceof Error ? error.message : String(error));
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new OnlineError('offline', 'MangaDex needs the desktop app.');
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw toOnlineError(error);
  }
}

export const getAccount = () => call<Account>('online_account');

export interface SignInForm {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export const signIn = (form: SignInForm) => call<Account>('online_sign_in', { form });
export const signOut = () => call<Account>('online_sign_out');

export const searchManga = (query: SearchQuery) => call<Page<Manga>>('online_search', { query });
export const getTags = () => call<Tag[]>('online_tags');
export const getOnlineSeries = (mangaId: string) => call<SeriesView>('online_series', { mangaId });
export const getOnlineChapters = (mangaId: string) =>
  call<ChaptersView>('online_chapters', { mangaId });
export const setSeriesLanguage = (mangaId: string, language: string | null) =>
  call<void>('online_set_series_language', { mangaId, language });
export const setFollow = (mangaId: string, follow: boolean) =>
  call<void>('online_follow', { mangaId, follow });
export const setReadingStatus = (mangaId: string, status: ReadingStatus | null) =>
  call<void>('online_set_reading_status', { mangaId, status });
export const getFollows = () => call<FollowView[]>('online_follows');
export const getFeed = () => call<FeedView>('online_feed');
export const refreshFeed = () => call<FeedView>('online_refresh_feed');
export const markFeedSeen = () => call<void>('online_mark_feed_seen');
export const openOnlineChapter = (mangaId: string, chapterId: string) =>
  call<OpenedOnlineChapter>('online_open_chapter', { mangaId, chapterId });
export const recordOnlineProgress = (
  mangaId: string,
  chapterId: string,
  page: number,
  finished: boolean
) => call<void>('online_record_progress', { mangaId, chapterId, page, finished });
export const markChaptersRead = (mangaId: string, chapterIds: string[], read: boolean) =>
  call<Record<string, Marker>>('online_mark_read', { mangaId, chapterIds, read });

export type MangaDexPage =
  | { kind: 'home' }
  | { kind: 'title'; id: string }
  | { kind: 'chapter'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'apiClients' };

export const openMangaDex = (page: MangaDexPage) => call<void>('online_open_mangadex', { page });

export const ACCOUNT_EVENT = 'online:account';
export const FEED_EVENT = 'online:feed';

export function onAccountChanged(handler: (account: Account) => void): Promise<UnlistenFn> {
  return listen<Account>(ACCOUNT_EVENT, event => handler(event.payload));
}

export function onFeedChanged(handler: () => void): Promise<UnlistenFn> {
  return listen(FEED_EVENT, () => handler());
}

export const ONLINE_SCHEME = 'kirei-online';
export type CoverSize = 256 | 512 | 'full';

/**
 * URL of a MangaDex cover, served by the `kirei-online` scheme: the image is
 * fetched in Rust and handed over as bytes, never hotlinked.
 */
export function onlineCoverUrl(manga: Pick<Manga, 'id' | 'cover'>, size: CoverSize = 256) {
  return manga.cover ? coverFileUrl(manga.id, manga.cover.fileName, size) : null;
}

/** The same URL from a manga id and a cover file name kept on their own. */
export function coverFileUrl(mangaId: string, fileName: string, size: CoverSize = 256) {
  return convertFileSrc(`cover/${mangaId}/${fileName}/${size}`, ONLINE_SCHEME);
}
