import { describe, expect, it } from 'vitest';

import { fitScreen, ratioOf, type FitPage } from './fit';

const page = (ratio: number, naturalHeight: number | null = null): FitPage => ({
  ratio,
  naturalHeight,
});

describe('fitScreen', () => {
  const box = { width: 1400, height: 900 };

  it('shows a whole page in the box on screen fit', () => {
    expect(fitScreen([page(2 / 3)], box, 'screen')).toEqual({ widths: [600], height: 900 });
  });

  it('shrinks a spread to the width when it is too wide for the height', () => {
    expect(fitScreen([page(1), page(1)], { width: 1002, height: 900 }, 'screen')).toEqual({
      widths: [500, 500],
      height: 500,
    });
  });

  it('fills the width up to the cap per page when fitted to width', () => {
    expect(fitScreen([page(2 / 3)], box, 'width')).toEqual({ widths: [960], height: 1440 });
    expect(fitScreen([page(2 / 3)], { width: 600, height: 900 }, 'width')).toEqual({
      widths: [600],
      height: 900,
    });
  });

  it('fills the height even when the page overflows the width', () => {
    expect(fitScreen([page(2)], box, 'height')).toEqual({ widths: [1800], height: 900 });
  });

  it('shows the natural size on original and falls back to screen without one', () => {
    expect(fitScreen([page(2 / 3, 1350)], box, 'original')).toEqual({
      widths: [900],
      height: 1350,
    });
    expect(fitScreen([page(2 / 3)], box, 'original')).toEqual({ widths: [600], height: 900 });
  });

  it('returns nothing for an empty box or screen', () => {
    expect(fitScreen([], box, 'screen')).toEqual({ widths: [], height: 0 });
    expect(fitScreen([page(1)], { width: 0, height: 0 }, 'screen')).toEqual({
      widths: [],
      height: 0,
    });
  });
});

describe('ratioOf', () => {
  it('prefers a measured ratio, then the header, then 2:3', () => {
    expect(ratioOf({ width: 100, height: 200 }, 0.8)).toBe(0.8);
    expect(ratioOf({ width: 100, height: 200 })).toBe(0.5);
    expect(ratioOf({ width: null, height: null })).toBeCloseTo(2 / 3);
  });
});
