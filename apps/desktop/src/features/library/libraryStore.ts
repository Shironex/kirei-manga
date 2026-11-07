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
  /** The latest progress report while a scan runs, else null. */
  scan: ScanProgress | null;
  scanError: string | null;
  lastScan: ScanSummary | null;
  /** Bumped whenever the catalogue may have changed. */
  version: number;
}

let state: LibraryState = {
  status: 'loading',
  error: null,
  roots: [],
  series: [],
  scan: null,
  scanError: null,
  lastScan: null,
  version: 0,
};
const subscribers = new Set<() => void>();
let started = false;

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
    set({ scan: null });
    await refreshLibrary();
  }
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
    void onScanProgress(progress => {
      if (state.scan) set({ scan: progress });
    });
  }
}

function subscribe(notify: () => void) {
  start();
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

export function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, () => state);
}
