import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const { linkFromMangaDex, needsMangaDexLink, progressFromChapter, reportProgress } =
  await import('./tracking');

describe('MangaDex tracking commands', () => {
  beforeEach(() => invoke.mockReset());

  it('links with origin mangadex and the AniList id MangaDex names', async () => {
    await linkFromMangaDex('md-1', 30013, 'Moonlit Road');
    expect(invoke).toHaveBeenLastCalledWith('tracking_link', {
      series: { kind: 'mangadex', id: 'md-1' },
      mediaId: 30013,
      title: 'Moonlit Road',
      totalChapters: null,
      origin: 'mangadex',
    });
  });

  it('reports progress for a MangaDex series', async () => {
    invoke.mockResolvedValueOnce(true);
    await expect(reportProgress({ kind: 'mangadex', id: 'md-1' }, 12)).resolves.toBe(true);
    expect(invoke).toHaveBeenLastCalledWith('tracking_report_progress', {
      series: { kind: 'mangadex', id: 'md-1' },
      progress: 12,
    });
  });
});

describe('needsMangaDexLink', () => {
  it('links only a known AniList id on an unlinked series', () => {
    expect(needsMangaDexLink(30013, { link: null })).toBe(true);
    expect(needsMangaDexLink(null, { link: null })).toBe(false);
    expect(needsMangaDexLink(30013, null)).toBe(false);
    expect(
      needsMangaDexLink(30013, {
        link: {} as NonNullable<Parameters<typeof needsMangaDexLink>[1]>['link'],
      })
    ).toBe(false);
  });
});

describe('progressFromChapter', () => {
  it('counts whole chapters and skips oneshots', () => {
    expect(progressFromChapter('12')).toBe(12);
    expect(progressFromChapter('12.5')).toBe(12);
    expect(progressFromChapter('0')).toBeNull();
    expect(progressFromChapter('extra')).toBeNull();
    expect(progressFromChapter(null)).toBeNull();
  });
});
