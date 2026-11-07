import { useCallback, useEffect, useRef, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

import { isTauri } from '@/lib/ipc';
import { formatBytes } from '@/lib/reader';
import {
  addRoot,
  listRoots,
  onScanProgress,
  removeRoot,
  scanLibrary,
  type LibraryRoot,
  type ScanProgress,
} from '@/lib/library';
import {
  clearCoverCache,
  getCoverCache,
  purgeHiddenProgress,
  type CoverCacheUsage,
  type OrphanPurge,
} from '@/lib/settings/commands';

import { plural } from './format';

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Which root a scan runs for: an id, or `'all'` for every root. */
export type ScanTarget = number | 'all';

/**
 * State and actions of the Library folders section: roots with add, remove
 * and rescan through the existing library commands, plus the cover cache and
 * the hidden progress cleanup. Outside Tauri it stays empty and idle.
 */
export function useLibraryMaintenance() {
  const [roots, setRoots] = useState<LibraryRoot[] | null>(null);
  const [cache, setCache] = useState<CoverCacheUsage | null>(null);
  const [scanning, setScanning] = useState<ScanTarget | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const [nextRoots, nextCache] = await Promise.all([listRoots(), getCoverCache()]);
      if (!mounted.current) return;
      setRoots(nextRoots);
      setCache(nextCache);
    } catch (e) {
      if (mounted.current) setError(reason(e));
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    if (!isTauri()) return;
    const unlisten = onScanProgress(
      p => mounted.current && setProgress(p.phase === 'done' ? null : p)
    );
    return () => {
      mounted.current = false;
      void unlisten.then(stop => stop());
    };
  }, [refresh]);

  /** Runs `work` with the error and notice cleared, reporting a failure inline. */
  const run = useCallback(async (work: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    try {
      await work();
    } catch (e) {
      if (mounted.current) setError(reason(e));
    }
  }, []);

  const scan = useCallback(
    (target: ScanTarget) =>
      run(async () => {
        setScanning(target);
        try {
          const summary = await scanLibrary(target === 'all' ? undefined : target);
          if (summary.rootErrors.length > 0) setError(summary.rootErrors.join('\n'));
        } finally {
          if (mounted.current) {
            setScanning(null);
            setProgress(null);
          }
          await refresh();
        }
      }),
    [refresh, run]
  );

  const addFolder = useCallback(
    () =>
      run(async () => {
        const picked = await openDialog({ directory: true, title: 'Add a library folder' });
        if (typeof picked !== 'string') return;
        const root = await addRoot(picked);
        await refresh();
        await scan(root.id);
      }),
    [refresh, run, scan]
  );

  const removeFolder = useCallback(
    (root: LibraryRoot) =>
      run(async () => {
        await removeRoot(root.id);
        setNotice(`Removed ${root.path}. Its reading progress is kept, hidden.`);
        await refresh();
      }),
    [refresh, run]
  );

  const purge = useCallback(
    () =>
      run(async () => {
        setBusy(true);
        try {
          const result: OrphanPurge = await purgeHiddenProgress();
          setNotice(describePurge(result));
        } finally {
          if (mounted.current) setBusy(false);
        }
      }),
    [run]
  );

  const clearCovers = useCallback(
    () =>
      run(async () => {
        setBusy(true);
        try {
          const freed = await clearCoverCache();
          await refresh();
          // Thumbnails are made again by the next scan; run it now so the
          // library does not show blank covers.
          const rescan = (roots?.length ?? 0) > 0;
          if (rescan) await scan('all');
          setNotice(
            `Cleared ${plural(freed.files, 'cover thumbnail')} (${formatBytes(freed.bytes)}).` +
              (rescan ? ' Covers were made again from your files.' : '')
          );
        } finally {
          if (mounted.current) setBusy(false);
        }
      }),
    [refresh, roots, run, scan]
  );

  return {
    available: isTauri(),
    roots,
    cache,
    scanning,
    progress,
    busy: busy || scanning !== null,
    error,
    notice,
    addFolder,
    removeFolder,
    scan,
    purge,
    clearCovers,
  };
}

export function describePurge({ progress, settings }: OrphanPurge): string {
  if (progress === 0 && settings === 0) return 'There was no hidden progress to clean up.';
  const parts: string[] = [];
  if (progress > 0)
    parts.push(`${progress} chapter progress ${progress === 1 ? 'entry' : 'entries'}`);
  if (settings > 0) parts.push(`${settings} series ${settings === 1 ? 'setting' : 'settings'}`);
  return `Deleted ${parts.join(' and ')}.`;
}
