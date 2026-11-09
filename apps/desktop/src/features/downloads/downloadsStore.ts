import { useSyncExternalStore } from 'react';

import { isTauri } from '@/lib/ipc';
import {
  applyDownloadEvent,
  getDownloadFolder,
  listDownloads,
  onDownloadsChanged,
  type DownloadEvent,
  type DownloadFolder,
  type DownloadJob,
} from '@/lib/downloads';

/**
 * The download queue as the screens see it. Loads once, then follows the
 * `downloads:changed` events, so the Downloads page and any badge agree
 * without polling.
 */
export interface DownloadsState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  jobs: DownloadJob[];
  folder: DownloadFolder | null;
}

const INITIAL: DownloadsState = { status: 'loading', error: null, jobs: [], folder: null };

let state: DownloadsState = INITIAL;
const subscribers = new Set<() => void>();
let started = false;
/** Events that arrive while the first list is loading, applied after it. */
let pending: DownloadEvent[] | null = null;

function set(patch: Partial<DownloadsState>) {
  state = { ...state, ...patch };
  for (const notify of subscribers) notify();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function handleDownloadEvent(event: DownloadEvent): void {
  if (pending) {
    pending.push(event);
    return;
  }
  set({ jobs: applyDownloadEvent(state.jobs, event) });
}

export async function refreshDownloads(): Promise<void> {
  if (!isTauri()) {
    set({ status: 'error', error: 'Running outside Tauri: there is no download queue.' });
    return;
  }
  pending = [];
  try {
    const [jobs, folder] = await Promise.all([listDownloads(), getDownloadFolder()]);
    const queued = pending;
    pending = null;
    set({ status: 'ready', error: null, jobs: queued.reduce(applyDownloadEvent, jobs), folder });
  } catch (error) {
    pending = null;
    set({ status: 'error', error: message(error) });
  }
}

/** Reloads the folder line, after the downloads folder setting changed. */
export async function refreshDownloadFolder(): Promise<void> {
  if (!isTauri()) return;
  try {
    set({ folder: await getDownloadFolder() });
  } catch {
    // The page keeps the last folder it knew.
  }
}

function start() {
  if (started) return;
  started = true;
  if (isTauri()) {
    // Lives as long as the app.
    void onDownloadsChanged(handleDownloadEvent);
  }
  void refreshDownloads();
}

function subscribe(notify: () => void) {
  start();
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function getDownloadsState(): DownloadsState {
  return state;
}

/** Back to a fresh store, for tests. */
export function resetDownloadsStore(): void {
  started = false;
  pending = null;
  state = INITIAL;
}

export function useDownloads(): DownloadsState {
  return useSyncExternalStore(subscribe, () => state);
}
