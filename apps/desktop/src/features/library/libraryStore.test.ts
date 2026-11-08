import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ScanProgress } from '@/lib/library';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));

const { STALE_SCAN_MS, getLibraryState, handleScanProgress, rescanLibrary, resetLibraryStore } =
  await import('./libraryStore');

function inTauri() {
  const win = globalThis as unknown as { window?: Record<string, unknown> };
  win.window = { __TAURI_INTERNALS__: {} };
}

function progress(phase: ScanProgress['phase'], done = 0, total = 0): ScanProgress {
  return { phase, root: '/manga', done, total, current: null };
}

/** Answers the catalogue reads `refreshLibrary` makes. */
function answerCatalogue(series: unknown[] = []) {
  invoke.mockImplementation(async (command: string) => {
    if (command === 'library_roots') return [];
    if (command === 'library_series') return series;
    throw new Error(`unexpected command ${command}`);
  });
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('library store scans', () => {
  beforeEach(() => {
    invoke.mockReset();
    resetLibraryStore();
    inTauri();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a scan it did not start, such as a watcher rescan', () => {
    answerCatalogue();
    handleScanProgress(progress('reading', 2, 5));
    expect(getLibraryState().scan).toMatchObject({ phase: 'reading', done: 2, total: 5 });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('reloads the catalogue when that scan reports done', async () => {
    answerCatalogue([{ id: 7 }]);
    handleScanProgress(progress('reading', 1, 1));
    const before = getLibraryState().version;
    handleScanProgress(progress('done', 1, 1));
    expect(getLibraryState().scan).toBeNull();
    await flush();
    expect(invoke).toHaveBeenCalledWith('library_series');
    expect(getLibraryState().version).toBe(before + 1);
    expect(getLibraryState().series).toEqual([{ id: 7 }]);
  });

  it('reloads on a lone done report too', async () => {
    answerCatalogue();
    handleScanProgress(progress('done'));
    await flush();
    expect(getLibraryState()).toMatchObject({ scan: null, version: 1 });
  });

  it('drops a watcher scan that goes quiet without done', async () => {
    vi.useFakeTimers();
    answerCatalogue();
    handleScanProgress(progress('covers', 1, 3));
    vi.advanceTimersByTime(STALE_SCAN_MS - 1);
    expect(getLibraryState().scan).not.toBeNull();
    handleScanProgress(progress('covers', 2, 3));
    vi.advanceTimersByTime(STALE_SCAN_MS - 1);
    expect(getLibraryState().scan).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getLibraryState().scan).toBeNull();
    await vi.runAllTimersAsync();
    expect(invoke).toHaveBeenCalledWith('library_series');
  });

  it('leaves its own scan to rescanLibrary and reloads once', async () => {
    let finish: (summary: unknown) => void = () => {};
    invoke.mockImplementation(async (command: string) => {
      if (command === 'library_scan') return new Promise(resolve => (finish = resolve));
      if (command === 'library_roots' || command === 'library_series') return [];
      throw new Error(`unexpected command ${command}`);
    });
    const running = rescanLibrary();
    handleScanProgress(progress('reading', 1, 2));
    expect(getLibraryState().scan).toMatchObject({ phase: 'reading' });
    handleScanProgress(progress('done', 1, 1));
    expect(getLibraryState().scan).toMatchObject({ phase: 'done' });
    expect(invoke).not.toHaveBeenCalledWith('library_series');
    finish({ roots: 1 });
    await running;
    expect(getLibraryState()).toMatchObject({ scan: null, version: 1, lastScan: { roots: 1 } });
    expect(invoke.mock.calls.filter(([command]) => command === 'library_series')).toHaveLength(1);
  });

  it('does not start a manual scan over a watcher scan', async () => {
    answerCatalogue();
    handleScanProgress(progress('reading', 0, 4));
    await rescanLibrary();
    expect(invoke).not.toHaveBeenCalledWith('library_scan', expect.anything());
  });
});
