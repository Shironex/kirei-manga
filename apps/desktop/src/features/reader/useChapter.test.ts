import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reader = vi.hoisted(() => ({
  openSource: vi.fn(),
  pageMeta: vi.fn(),
  closeSource: vi.fn(),
}));
vi.mock('@/lib/reader', () => reader);
vi.mock('@/lib/library', () => ({
  chapterLabel: () => '',
  getSeriesDetail: vi.fn(),
  getSeriesSettings: vi.fn(),
}));

import { handOver, prefetchChapter, prefetchedChapter } from './useChapter';

let nextId = 1;
const target = (path: string) => ({ kind: 'file' as const, path, page: 0 });
const flush = async () => {
  await vi.runAllTimersAsync();
};

beforeEach(() => {
  vi.useFakeTimers();
  reader.openSource.mockImplementation(async () => ({
    id: nextId++,
    kind: 'zip',
    pages: [{}, {}, {}],
    openMs: 1,
  }));
  reader.pageMeta.mockResolvedValue({ revision: 1, pages: [{}, {}, {}] });
  reader.closeSource.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('prefetchChapter', () => {
  it('opens a chapter once however many readers ask', async () => {
    const first = prefetchChapter(target('/a.cbz'));
    const second = prefetchChapter(target('/a.cbz'));
    expect(await first.promise).toBe(await second.promise);
    expect(reader.openSource).toHaveBeenCalledTimes(1);
    first.release();
    second.release();
    await flush();
  });

  it('closes the source once nobody holds it', async () => {
    const { promise, release } = prefetchChapter(target('/b.cbz'));
    const chapter = await promise;
    release();
    await flush();
    expect(reader.closeSource).toHaveBeenCalledWith(chapter.source.id);
    expect(prefetchedChapter(target('/b.cbz'))).toBeNull();
  });

  it('survives a hand over from the reader before to the next one', async () => {
    const before = prefetchChapter(target('/c.cbz'));
    await before.promise;
    before.release();
    // The next reader takes it in the same commit, before the deferred close.
    const after = prefetchChapter(target('/c.cbz'));
    await flush();
    expect(reader.closeSource).not.toHaveBeenCalled();
    after.release();
    await flush();
    expect(reader.closeSource).toHaveBeenCalledTimes(1);
  });

  it('applies the handoff once: start page, offset and carried state', async () => {
    const { promise, release } = prefetchChapter(target('/d.cbz'));
    await promise;
    handOver(target('/d.cbz'), {
      page: 9,
      offset: 0.4,
      carry: { webtoonScale: 1.5, revision: 7 },
      settings: { reader: { mode: 'webtoon' } },
    });
    const chapter = prefetchedChapter(target('/d.cbz'));
    expect(chapter).toMatchObject({
      startPage: 2,
      startOffset: 0.4,
      carry: { webtoonScale: 1.5, revision: 7 },
      settings: { reader: { mode: 'webtoon' } },
    });
    expect(prefetchedChapter(target('/d.cbz'))).toBe(chapter);
    release();
    await flush();
  });

  it('drops a failed open so the normal open can show the error', async () => {
    reader.openSource.mockRejectedValueOnce(new Error('gone'));
    const { promise, release } = prefetchChapter(target('/e.cbz'));
    await expect(promise).rejects.toThrow('gone');
    release();
    await flush();
    expect(prefetchedChapter(target('/e.cbz'))).toBeNull();
    const retry = prefetchChapter(target('/e.cbz'));
    await retry.promise;
    expect(reader.openSource).toHaveBeenCalledTimes(2);
    retry.release();
    await flush();
  });
});
