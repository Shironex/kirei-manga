import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const {
  applyDownloadEvent,
  autoDownloadNew,
  cancelDownloads,
  describeJob,
  downloadProgress,
  pauseDownloads,
  requestDownload,
} = await import('./downloads');
type DownloadJob = import('./downloads').DownloadJob;

function job(patch: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: 1,
    chapterId: '5c0a1b2c-0000-4000-8000-000000000001',
    mangaId: null,
    seriesTitle: null,
    chapterLabel: null,
    language: null,
    quality: 'data',
    state: 'queued',
    pagesDone: 0,
    pagesTotal: null,
    error: null,
    path: null,
    auto: false,
    addedAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe('commands', () => {
  beforeEach(() => invoke.mockReset());

  it('passes the arguments the Rust commands expect', async () => {
    await requestDownload(['a', 'b']);
    expect(invoke).toHaveBeenLastCalledWith('downloads_enqueue', { chapterIds: ['a', 'b'] });
    await autoDownloadNew(['c']);
    expect(invoke).toHaveBeenLastCalledWith('downloads_auto', { chapterIds: ['c'] });
    await pauseDownloads();
    expect(invoke).toHaveBeenLastCalledWith('downloads_pause', { ids: null });
    await cancelDownloads([4]);
    expect(invoke).toHaveBeenLastCalledWith('downloads_cancel', { ids: [4] });
  });
});

describe('applyDownloadEvent', () => {
  it('adds, updates and removes jobs, keeping them in queue order', () => {
    let jobs = applyDownloadEvent([], { kind: 'changed', job: job({ id: 2 }) });
    jobs = applyDownloadEvent(jobs, { kind: 'changed', job: job({ id: 1 }) });
    expect(jobs.map(j => j.id)).toEqual([1, 2]);
    jobs = applyDownloadEvent(jobs, {
      kind: 'changed',
      job: job({ id: 2, state: 'downloading', pagesDone: 3, pagesTotal: 10 }),
    });
    expect(jobs[1]?.pagesDone).toBe(3);
    jobs = applyDownloadEvent(jobs, { kind: 'removed', id: 1 });
    expect(jobs.map(j => j.id)).toEqual([2]);
  });
});

describe('describing a job', () => {
  it('reads progress from the page counts', () => {
    expect(downloadProgress(job())).toBe(0);
    expect(downloadProgress(job({ pagesDone: 5, pagesTotal: 20 }))).toBe(0.25);
    expect(downloadProgress(job({ state: 'done' }))).toBe(1);
  });

  it('says what is happening in plain words', () => {
    expect(describeJob(job())).toBe('Waiting');
    expect(describeJob(job({ state: 'downloading' }))).toBe('Starting');
    expect(describeJob(job({ state: 'downloading', pagesDone: 4, pagesTotal: 18 }))).toBe(
      '4 of 18 pages'
    );
    expect(describeJob(job({ state: 'paused', pagesDone: 4, pagesTotal: 18 }))).toBe(
      'Paused, 4 of 18 pages'
    );
    expect(describeJob(job({ state: 'failed', error: 'offline' }))).toBe('Failed: offline');
    expect(describeJob(job({ state: 'done' }))).toBe('In your library');
  });
});
