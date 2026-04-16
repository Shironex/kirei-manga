import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryEvents, type Series } from '@kireimanga/shared';

const emitWithResponseMock =
  vi.fn<(event: string, payload: unknown) => Promise<unknown>>();

vi.mock('@/lib/socket', () => ({
  emitWithResponse: (event: string, payload: unknown) => emitWithResponseMock(event, payload),
  getSocket: () => ({ on: vi.fn(), off: vi.fn() }),
}));

import { useLibraryStore } from './library-store';

function resetLibraryStore(): void {
  useLibraryStore.setState({
    series: [],
    mangadexIndex: {},
    loading: false,
    error: null,
  });
}

function makeSeries(overrides: Partial<Series>): Series {
  return {
    id: 's1',
    mangadexId: 'mdx-1',
    source: 'mangadex',
    title: 'Sample',
    status: 'reading',
    addedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  emitWithResponseMock.mockReset();
  resetLibraryStore();
});

describe('library-store follow()', () => {
  it('inserts a synthetic pending row immediately (optimistic)', async () => {
    let resolveEmit: (value: { series: Series }) => void = () => {};
    emitWithResponseMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveEmit = resolve as (v: { series: Series }) => void;
        })
    );

    const promise = useLibraryStore.getState().follow('mdx-1');

    // Drain microtask so the optimistic set() runs.
    await Promise.resolve();

    const { series, mangadexIndex } = useLibraryStore.getState();
    expect(series).toHaveLength(1);
    expect(series[0]!.id).toBe('pending:mdx-1');
    expect(series[0]!.mangadexId).toBe('mdx-1');
    expect(mangadexIndex['mdx-1']).toBe('pending:mdx-1');

    // Finish the emit so we don't leak an unresolved promise.
    resolveEmit({ series: makeSeries({ id: 'real-1', mangadexId: 'mdx-1' }) });
    await promise;
  });

  it('replaces the synthetic row with the real row on success', async () => {
    const real = makeSeries({ id: 'real-1', mangadexId: 'mdx-1', title: 'Berserk' });
    emitWithResponseMock.mockResolvedValueOnce({ series: real });

    await useLibraryStore.getState().follow('mdx-1');

    const { series, mangadexIndex } = useLibraryStore.getState();
    expect(series).toHaveLength(1);
    expect(series[0]).toEqual(real);
    expect(mangadexIndex['mdx-1']).toBe('real-1');
    expect(emitWithResponseMock).toHaveBeenCalledWith(LibraryEvents.FOLLOW, { mangadexId: 'mdx-1' });
  });

  it('rolls back the synthetic row when the server returns an error', async () => {
    emitWithResponseMock.mockResolvedValueOnce({ error: 'already followed' });

    await expect(useLibraryStore.getState().follow('mdx-1')).rejects.toThrow(/already followed/);

    const { series, mangadexIndex, error } = useLibraryStore.getState();
    expect(series).toEqual([]);
    expect(mangadexIndex).toEqual({});
    expect(error).toBe('already followed');
  });

  it('rolls back the synthetic row when the emit rejects', async () => {
    emitWithResponseMock.mockRejectedValueOnce(new Error('network down'));

    await expect(useLibraryStore.getState().follow('mdx-1')).rejects.toThrow(/network down/);

    expect(useLibraryStore.getState().series).toEqual([]);
    expect(useLibraryStore.getState().mangadexIndex).toEqual({});
  });

  it('is idempotent when the mangadexId is already tracked', async () => {
    const real = makeSeries({ id: 'real-1', mangadexId: 'mdx-1' });
    useLibraryStore.setState({
      series: [real],
      mangadexIndex: { 'mdx-1': 'real-1' },
    });

    await useLibraryStore.getState().follow('mdx-1');

    expect(emitWithResponseMock).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().series).toEqual([real]);
  });
});

describe('library-store unfollow()', () => {
  it('removes the entry optimistically and emits unfollow', async () => {
    const real = makeSeries({ id: 'real-1', mangadexId: 'mdx-1' });
    useLibraryStore.setState({
      series: [real],
      mangadexIndex: { 'mdx-1': 'real-1' },
    });
    emitWithResponseMock.mockResolvedValueOnce({ success: true });

    await useLibraryStore.getState().unfollow('mdx-1');

    const { series, mangadexIndex } = useLibraryStore.getState();
    expect(series).toEqual([]);
    expect(mangadexIndex).toEqual({});
    expect(emitWithResponseMock).toHaveBeenCalledWith(LibraryEvents.UNFOLLOW, { id: 'real-1' });
  });

  it('rolls back the entry when the server rejects', async () => {
    const real = makeSeries({ id: 'real-1', mangadexId: 'mdx-1' });
    useLibraryStore.setState({
      series: [real],
      mangadexIndex: { 'mdx-1': 'real-1' },
    });
    emitWithResponseMock.mockResolvedValueOnce({ success: false, error: 'not found' });

    await expect(useLibraryStore.getState().unfollow('mdx-1')).rejects.toThrow(/not found/);

    const { series, mangadexIndex, error } = useLibraryStore.getState();
    expect(series).toEqual([real]);
    expect(mangadexIndex).toEqual({ 'mdx-1': 'real-1' });
    expect(error).toBe('not found');
  });

  it('rolls back when the emit rejects', async () => {
    const real = makeSeries({ id: 'real-1', mangadexId: 'mdx-1' });
    useLibraryStore.setState({
      series: [real],
      mangadexIndex: { 'mdx-1': 'real-1' },
    });
    emitWithResponseMock.mockRejectedValueOnce(new Error('network down'));

    await expect(useLibraryStore.getState().unfollow('mdx-1')).rejects.toThrow(/network down/);

    expect(useLibraryStore.getState().series).toEqual([real]);
    expect(useLibraryStore.getState().mangadexIndex).toEqual({ 'mdx-1': 'real-1' });
  });

  it('skips the server round-trip when unfollowing a synthetic pending row', async () => {
    const synthetic = makeSeries({ id: 'pending:mdx-1', mangadexId: 'mdx-1' });
    useLibraryStore.setState({
      series: [synthetic],
      mangadexIndex: { 'mdx-1': 'pending:mdx-1' },
    });

    await useLibraryStore.getState().unfollow('mdx-1');

    expect(emitWithResponseMock).not.toHaveBeenCalled();
    expect(useLibraryStore.getState().series).toEqual([]);
    expect(useLibraryStore.getState().mangadexIndex).toEqual({});
  });

  it('is a no-op for an unknown mangadexId', async () => {
    await useLibraryStore.getState().unfollow('mdx-nope');
    expect(emitWithResponseMock).not.toHaveBeenCalled();
  });
});
