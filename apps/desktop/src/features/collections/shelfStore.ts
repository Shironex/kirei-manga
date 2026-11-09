import { useEffect, useSyncExternalStore } from 'react';

import { isTauri } from '@/lib/ipc';
import {
  getShelfOverview,
  getWantToRead,
  itemKey,
  setWantToRead,
  type SeriesRef,
  type ShelfItem,
  type ShelfOverview,
} from '@/lib/shelf';

import { useLibrary } from '../library/libraryStore';

/**
 * Collections, tags, saved filters and Want to Read as every screen sees
 * them. One store, so the Home rows, the collections page, the palette and
 * the series page agree, and any change through `shelfChange` refreshes all
 * of them. `version` moves on every refresh, so views that read their own
 * lists (a collection's members, a filter's results) refetch.
 */
export interface ShelfState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  overview: ShelfOverview;
  /** Want to Read, newest first. */
  want: ShelfItem[];
  version: number;
}

const EMPTY: ShelfOverview = { wantCount: 0, collections: [], tags: [], filters: [] };

const INITIAL: ShelfState = {
  status: 'loading',
  error: null,
  overview: EMPTY,
  want: [],
  version: 0,
};

let state: ShelfState = INITIAL;
const subscribers = new Set<() => void>();
let started = false;

function set(patch: Partial<ShelfState>) {
  state = { ...state, ...patch };
  for (const notify of subscribers) notify();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function refreshShelf(): Promise<void> {
  if (!isTauri()) {
    set({ status: 'error', error: 'Running outside Tauri: there is no library to read.' });
    return;
  }
  try {
    const [overview, want] = await Promise.all([getShelfOverview(), getWantToRead()]);
    set({ status: 'ready', error: null, overview, want, version: state.version + 1 });
  } catch (error) {
    set({ status: 'error', error: message(error) });
  }
}

/**
 * Runs a shelf command, then refreshes the store, whether it worked or not
 * (a half applied bulk edit still shows as it is). Rejects with the reason
 * in plain words, for the caller to show where the user acted.
 */
export async function shelfChange<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw new Error(message(error), { cause: error });
  } finally {
    await refreshShelf();
  }
}

/**
 * Puts a series in Want to Read: a local one (`{ source: 'local', seriesId }`)
 * or a MangaDex title (`{ source: 'mangadex', remoteId, title, coverFile }`).
 * The online series page calls this; nothing else is needed for a remote
 * title to show in Want to Read, on Home and in smart filters.
 */
export function addToWantToRead(ref: SeriesRef): Promise<void> {
  return shelfChange(() => setWantToRead([ref], true));
}

export function removeFromWantToRead(ref: SeriesRef): Promise<void> {
  return shelfChange(() => setWantToRead([ref], false));
}

/** Key of a ref in the same form as `itemKey`, to look it up in a list. */
export function refKey(ref: SeriesRef): string {
  return ref.source === 'local' ? `s:${ref.seriesId}` : `r:${ref.source}:${ref.remoteId}`;
}

/** Whether a series is in Want to Read, from the store's copy of the list. */
export function isWanted(want: readonly ShelfItem[], ref: SeriesRef): boolean {
  const key = refKey(ref);
  return want.some(item => itemKey(item) === key);
}

/**
 * Refreshes the shelf whenever the catalogue reloads (a scan, a removed
 * folder), so counts and lists drop series that went away and pick up those
 * a rescan brought back. Mounted once, in the shell.
 */
export function useShelfFollowsLibrary(): void {
  const { version } = useLibrary();
  useEffect(() => {
    if (version > 1) void refreshShelf();
  }, [version]);
}

function start() {
  if (started) return;
  started = true;
  void refreshShelf();
}

function subscribe(notify: () => void) {
  start();
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function getShelfState(): ShelfState {
  return state;
}

/** Back to a fresh store, for tests. */
export function resetShelfStore(): void {
  started = false;
  state = INITIAL;
}

export function useShelf(): ShelfState {
  return useSyncExternalStore(subscribe, () => state);
}
