import { describe, expect, it } from 'vitest';

import { EMPTY_SELECTION, keepShown, select, selectedInOrder, toggleAll } from './selection';

const order = [5, 3, 9, 1, 7];

describe('selection', () => {
  it('toggles one series and moves the anchor', () => {
    const one = select(EMPTY_SELECTION, 9, order);
    expect([...one.ids]).toEqual([9]);
    expect(one.anchor).toBe(9);
    const none = select(one, 9, order);
    expect(none.ids.size).toBe(0);
  });

  it('selects a run in grid order with shift, either direction', () => {
    const anchored = select(EMPTY_SELECTION, 3, order);
    const forward = select(anchored, 1, order, true);
    expect(selectedInOrder(forward, order)).toEqual([3, 9, 1]);
    const backward = select(select(EMPTY_SELECTION, 7, order), 9, order, true);
    expect(selectedInOrder(backward, order)).toEqual([9, 1, 7]);
  });

  it('treats shift without an anchor as a plain click', () => {
    expect([...select(EMPTY_SELECTION, 1, order, true).ids]).toEqual([1]);
  });

  it('selects all, then nothing', () => {
    const all = toggleAll(EMPTY_SELECTION, order);
    expect(all.ids.size).toBe(5);
    expect(toggleAll(all, order).ids.size).toBe(0);
  });

  it('drops what the grid no longer shows', () => {
    const picked = select(select(EMPTY_SELECTION, 5, order), 1, order);
    const kept = keepShown(picked, [1, 7]);
    expect([...kept.ids]).toEqual([1]);
    expect(kept.anchor).toBe(1);
    expect(keepShown(kept, [1, 7])).toBe(kept);
  });
});
