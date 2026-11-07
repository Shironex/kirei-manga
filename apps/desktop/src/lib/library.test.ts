import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  convertFileSrc: (key: string, scheme: string) => `${scheme}://localhost/${key}`,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));

const { chapterLabel, coverUrl, recordProgress, scanLibrary } = await import('./library');

describe('chapterLabel', () => {
  it('joins volume and chapter numbers', () => {
    expect(chapterLabel({ volume: 2, number: 11, title: null })).toBe('Vol. 2 Ch. 11');
    expect(chapterLabel({ volume: null, number: 10.5, title: 'Smoke' })).toBe('Ch. 10.5');
  });

  it('falls back to the title, then a generic label', () => {
    expect(chapterLabel({ volume: null, number: null, title: 'Oneshot' })).toBe('Oneshot');
    expect(chapterLabel({ volume: null, number: null, title: null })).toBe('Chapter');
  });
});

describe('commands', () => {
  beforeEach(() => invoke.mockReset());

  it('passes camelCase arguments the Rust commands expect', async () => {
    await scanLibrary();
    expect(invoke).toHaveBeenLastCalledWith('library_scan', { rootId: null });
    await scanLibrary(3);
    expect(invoke).toHaveBeenLastCalledWith('library_scan', { rootId: 3 });
    await recordProgress(7, 12);
    expect(invoke).toHaveBeenLastCalledWith('library_record_progress', { chapterId: 7, page: 12 });
  });
});

describe('coverUrl', () => {
  it('loads covers by hash over the kirei-cover scheme, never by path', () => {
    expect(coverUrl({ hash: 'ab12' })).toBe('kirei-cover://localhost/ab12');
  });
});
