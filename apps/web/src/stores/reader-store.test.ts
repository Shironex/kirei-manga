import { beforeEach, describe, expect, it } from 'vitest';
import { useReaderStore } from './reader-store';

function resetStore(overrides: Partial<ReturnType<typeof useReaderStore.getState>> = {}): void {
  useReaderStore.setState({
    chapterId: null,
    seriesId: null,
    totalPages: 0,
    pageIndex: 0,
    mode: 'single',
    direction: 'rtl',
    fit: 'width',
    chromeVisible: true,
    zoom: 1,
    ...overrides,
  });
}

describe('useReaderStore — single-page navigation', () => {
  beforeEach(() => resetStore());

  it('next increments pageIndex by 1', () => {
    resetStore({ totalPages: 10, pageIndex: 3, mode: 'single' });
    useReaderStore.getState().next();
    expect(useReaderStore.getState().pageIndex).toBe(4);
  });

  it('next is bounded at the last page', () => {
    resetStore({ totalPages: 5, pageIndex: 4, mode: 'single' });
    useReaderStore.getState().next();
    expect(useReaderStore.getState().pageIndex).toBe(4);
  });

  it('next is a no-op when totalPages is 0', () => {
    resetStore({ totalPages: 0, pageIndex: 0, mode: 'single' });
    useReaderStore.getState().next();
    expect(useReaderStore.getState().pageIndex).toBe(0);
  });

  it('prev decrements pageIndex by 1', () => {
    resetStore({ totalPages: 10, pageIndex: 3, mode: 'single' });
    useReaderStore.getState().prev();
    expect(useReaderStore.getState().pageIndex).toBe(2);
  });

  it('prev is bounded at 0', () => {
    resetStore({ totalPages: 10, pageIndex: 0, mode: 'single' });
    useReaderStore.getState().prev();
    expect(useReaderStore.getState().pageIndex).toBe(0);
  });
});

describe('useReaderStore — spread navigation', () => {
  beforeEach(() => resetStore({ mode: 'double' }));

  it('next from cover (0) advances to first spread primary (1)', () => {
    resetStore({ totalPages: 10, pageIndex: 0, mode: 'double' });
    useReaderStore.getState().next();
    expect(useReaderStore.getState().pageIndex).toBe(1);
  });

  it('next from a spread advances by 2', () => {
    resetStore({ totalPages: 10, pageIndex: 1, mode: 'double' });
    useReaderStore.getState().next();
    expect(useReaderStore.getState().pageIndex).toBe(3);
  });

  it('next is bounded at last page in double mode', () => {
    resetStore({ totalPages: 6, pageIndex: 5, mode: 'double' });
    useReaderStore.getState().next();
    expect(useReaderStore.getState().pageIndex).toBe(5);
  });

  it('next clamps rather than overshooting when only one page remains in the spread', () => {
    // totalPages=5 (last=4), at pageIndex=3 → spread (3,4). next() tries 5 but clamps to 4.
    resetStore({ totalPages: 5, pageIndex: 3, mode: 'double' });
    useReaderStore.getState().next();
    expect(useReaderStore.getState().pageIndex).toBe(4);
  });

  it('prev from spread (3) goes back to first spread (1)', () => {
    resetStore({ totalPages: 10, pageIndex: 3, mode: 'double' });
    useReaderStore.getState().prev();
    expect(useReaderStore.getState().pageIndex).toBe(1);
  });

  it('prev from first spread (1) goes to cover (0)', () => {
    resetStore({ totalPages: 10, pageIndex: 1, mode: 'double' });
    useReaderStore.getState().prev();
    expect(useReaderStore.getState().pageIndex).toBe(0);
  });

  it('prev from cover (0) stays at 0', () => {
    resetStore({ totalPages: 10, pageIndex: 0, mode: 'double' });
    useReaderStore.getState().prev();
    expect(useReaderStore.getState().pageIndex).toBe(0);
  });
});

describe('useReaderStore — goto', () => {
  it('goto clamps a negative index to 0', () => {
    resetStore({ totalPages: 10, pageIndex: 5, mode: 'single' });
    useReaderStore.getState().goto(-3);
    expect(useReaderStore.getState().pageIndex).toBe(0);
  });

  it('goto clamps an over-large index to the last page', () => {
    resetStore({ totalPages: 10, pageIndex: 5, mode: 'single' });
    useReaderStore.getState().goto(999);
    expect(useReaderStore.getState().pageIndex).toBe(9);
  });

  it('goto floors non-integer values', () => {
    resetStore({ totalPages: 10, pageIndex: 0, mode: 'single' });
    useReaderStore.getState().goto(4.8);
    expect(useReaderStore.getState().pageIndex).toBe(4);
  });

  it('goto is a no-op when totalPages is 0', () => {
    resetStore({ totalPages: 0, pageIndex: 0, mode: 'single' });
    useReaderStore.getState().goto(3);
    expect(useReaderStore.getState().pageIndex).toBe(0);
  });

  it('goto in double mode snaps an even target to the spread primary', () => {
    resetStore({ totalPages: 10, pageIndex: 0, mode: 'double' });
    useReaderStore.getState().goto(4);
    expect(useReaderStore.getState().pageIndex).toBe(3);
  });

  it('goto in double mode leaves an odd target untouched (already primary)', () => {
    resetStore({ totalPages: 10, pageIndex: 0, mode: 'double' });
    useReaderStore.getState().goto(5);
    expect(useReaderStore.getState().pageIndex).toBe(5);
  });

  it('goto(0) in double mode stays at the cover', () => {
    resetStore({ totalPages: 10, pageIndex: 3, mode: 'double' });
    useReaderStore.getState().goto(0);
    expect(useReaderStore.getState().pageIndex).toBe(0);
  });
});

describe('useReaderStore — last/first/setMode', () => {
  it('last in single mode goes to totalPages - 1', () => {
    resetStore({ totalPages: 10, pageIndex: 0, mode: 'single' });
    useReaderStore.getState().last();
    expect(useReaderStore.getState().pageIndex).toBe(9);
  });

  it('last in double mode snaps to the primary page of the final spread', () => {
    resetStore({ totalPages: 10, pageIndex: 0, mode: 'double' });
    useReaderStore.getState().last();
    expect(useReaderStore.getState().pageIndex).toBe(9);
  });

  it('last in double mode with even totalPages snaps back one (last=odd → primary=even-1)', () => {
    // totalPages=6 (last=5), spreadPrimary(5)=5 (odd → primary).
    resetStore({ totalPages: 6, pageIndex: 0, mode: 'double' });
    useReaderStore.getState().last();
    expect(useReaderStore.getState().pageIndex).toBe(5);
  });

  it('setMode to double snaps current pageIndex to spread primary', () => {
    resetStore({ totalPages: 10, pageIndex: 4, mode: 'single' });
    useReaderStore.getState().setMode('double');
    expect(useReaderStore.getState().pageIndex).toBe(3);
  });
});
