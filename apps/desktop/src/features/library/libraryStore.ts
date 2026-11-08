import { useSyncExternalStore } from 'react';
import { open } from '@tauri-apps/plugin-dialog';

import { isTauri } from '@/lib/ipc';
import {
  addRoot,
  listRoots,
  listSeries,
  onScanProgress,
  scanLibrary,
  type LibraryRoot,
  type ScanProgress,
  type ScanSummary,
  type SeriesSummary,
} from '@/lib/library';

/**
 * The library as the screens see it: roots, series and the scan in flight.
 * One store for the app, so the grid, the series page and the scan indicator
 * agree, and a finished scan refreshes all of them. Detail views read their
 * own series on demand and refetch when `version` moves.
 */
export interface LibraryState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  roots: LibraryRoot[];
  series: SeriesSummary[];
  /**
   * The latest progress report while a scan runs, else null. Covers scans
   * started here and rescans the library watcher starts on its own.
   */
  scan: ScanProgress | null;
  scanError: string | null;
  lastScan: ScanSummary | null;
  /** Bumped whenever the catalogue may have changed. */
  version: number;
}

const INITIAL: LibraryState = {
  status: 'loading',
  error: null,
  roots: [],
  series: [],
  scan: null,
  scanError: null,
  lastScan: null,
  version: 0,
};

let state: LibraryState = INITIAL;
const subscribers = new Set<() => void>();
let started = false;
/** True while a scan started by `rescanLibrary` is in flight. */
let ownScan = false;
/** Clears a watcher scan that went quiet without its `done` report. */
let staleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * How long a scan the store did not start may stay silent before the
 * indicator is dropped. A watcher rescan that fails sends no `done`, and
 * progress arrives per archive, so a minute of silence means it is over.
 */
export const STALE_SCAN_MS = 60_000;

function set(patch: Partial<LibraryState>) {
  state = { ...state, ...patch };
  for (const notify of subscribers) notify();
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function refreshLibrary(): Promise<void> {
  if (!isTauri()) {
    set({ status: 'error', error: 'Running outside Tauri: there is no library to read.' });
    return;
  }
  try {
    const [roots, series] = await Promise.all([listRoots(), listSeries()]);
    set({ status: 'ready', error: null, roots, series, version: state.version + 1 });
  } catch (error) {
    set({ status: 'error', error: message(error) });
  }
}

/** Scans every root (or one), then reloads the catalogue. */
export async function rescanLibrary(rootId?: number): Promise<void> {
  if (state.scan) return;
  ownScan = true;
  set({
    scan: { phase: 'discovering', root: '', done: 0, total: 0, current: null },
    scanError: null,
  });
  try {
    const summary = await scanLibrary(rootId);
    set({ lastScan: summary });
  } catch (error) {
    set({ scanError: message(error) });
  } finally {
    ownScan = false;
    clearStaleTimer();
    set({ scan: null });
    await refreshLibrary();
  }
}

function clearStaleTimer() {
  if (staleTimer) clearTimeout(staleTimer);
  staleTimer = null;
}

function finishOutsideScan() {
  clearStaleTimer();
  set({ scan: null });
  void refreshLibrary();
}

/**
 * Feeds one `library:scan-progress` report into the store, whoever started
 * the scan. A scan this store started is finished by `rescanLibrary`; any
 * other (a watcher rescan) is finished here on its `done` report, which
 * reloads the catalogue so the grid and the series page pick up the change.
 */
export function handleScanProgress(progress: ScanProgress): void {
  if (ownScan) {
    set({ scan: progress });
    return;
  }
  if (progress.phase === 'done') {
    finishOutsideScan();
    return;
  }
  set({ scan: progress, scanError: null });
  clearStaleTimer();
  staleTimer = setTimeout(finishOutsideScan, STALE_SCAN_MS);
}

/** Asks for a folder, adds it as a root and scans it. Resolves false when cancelled. */
export async function addFolderAndScan(): Promise<boolean> {
  const picked = await open({ directory: true, multiple: false, title: 'Add a folder of manga' });
  if (typeof picked !== 'string') return false;
  try {
    const root = await addRoot(picked);
    set({ roots: [...state.roots.filter(r => r.id !== root.id), root] });
    await rescanLibrary(root.id);
    return true;
  } catch (error) {
    set({ scanError: message(error) });
    return false;
  }
}

function start() {
  if (started) return;
  started = true;
  void refreshLibrary();
  if (isTauri()) {
    // Lives as long as the app; one listener feeds every screen.
    void onScanProgress(handleScanProgress);
  }
}

function subscribe(notify: () => void) {
  start();
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function getLibraryState(): LibraryState {
  return state;
}

/** Back to a fresh store, for tests. */
export function resetLibraryStore(): void {
  clearStaleTimer();
  ownScan = false;
  started = false;
  state = INITIAL;
}

export function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, () => state);
}
