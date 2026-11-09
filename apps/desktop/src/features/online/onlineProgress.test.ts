import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  convertFileSrc: (key: string, scheme: string) => `${scheme}://localhost/${key}`,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
vi.mock('@/lib/ipc', () => ({ isTauri: () => true }));

const { sendOnlineProgress } = await import('./onlineProgress');

const chapter = { mangaId: 'md-1', chapterId: 'ch-12', number: '12' };

function calls(command: string) {
  return invoke.mock.calls.filter(([name]) => name === command);
}

describe('sendOnlineProgress', () => {
  beforeEach(() => invoke.mockReset());

  it('records a page without telling AniList until the chapter is finished', async () => {
    await sendOnlineProgress(chapter, 3, 20, { current: null });
    expect(calls('online_record_progress')).toEqual([
      ['online_record_progress', { mangaId: 'md-1', chapterId: 'ch-12', page: 3, finished: false }],
    ]);
    expect(calls('tracking_report_progress')).toHaveLength(0);
  });

  it('reports the chapter number to AniList once when the last page is reached', async () => {
    const reported = { current: null };
    await sendOnlineProgress(chapter, 19, 20, reported);
    await sendOnlineProgress(chapter, 19, 20, reported);
    expect(calls('online_record_progress')).toHaveLength(2);
    expect(calls('tracking_report_progress')).toEqual([
      ['tracking_report_progress', { series: { kind: 'mangadex', id: 'md-1' }, progress: 12 }],
    ]);
  });

  it('sends nothing to AniList for a oneshot', async () => {
    await sendOnlineProgress({ ...chapter, number: null }, 9, 10, { current: null });
    expect(calls('tracking_report_progress')).toHaveLength(0);
  });
});
