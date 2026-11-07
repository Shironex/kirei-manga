import { describe, expect, it } from 'vitest';

import { buildScreens, lastVisiblePage, snapToScreen, stepScreen } from './screens';

const tall = { width: 1200, height: 1800 };
const wide = { width: 2400, height: 1800 };
const pages = [tall, tall, tall, wide, tall, tall];
const options = { detectSpreads: true, coverAlone: true, shift: false };

describe('buildScreens', () => {
  it('gives one page per screen outside double mode', () => {
    expect(buildScreens(pages, 'single', options)).toEqual([[0], [1], [2], [3], [4], [5]]);
    expect(buildScreens(pages, 'webtoon', options)).toHaveLength(6);
  });

  it('builds spreads in double mode', () => {
    expect(buildScreens(pages, 'double', options)).toEqual([[0], [1, 2], [3], [4, 5]]);
  });
});

describe('stepScreen', () => {
  const screens = buildScreens(pages, 'double', options);

  it('moves a whole spread at a time', () => {
    expect(stepScreen(screens, { page: 0, atEnd: false }, 1)).toEqual({ page: 1, atEnd: false });
    expect(stepScreen(screens, { page: 1, atEnd: false }, 1)).toEqual({ page: 3, atEnd: false });
    expect(stepScreen(screens, { page: 2, atEnd: false }, -1)).toEqual({ page: 0, atEnd: false });
  });

  it('opens the end card past the last screen and leaves it going back', () => {
    const end = stepScreen(screens, { page: 4, atEnd: false }, 1);
    expect(end).toEqual({ page: 4, atEnd: true });
    expect(stepScreen(screens, end, 1)).toBe(end);
    expect(stepScreen(screens, end, -1)).toEqual({ page: 4, atEnd: false });
  });

  it('stops at the first screen', () => {
    expect(stepScreen(screens, { page: 0, atEnd: false }, -1)).toEqual({ page: 0, atEnd: false });
  });

  it('handles an empty chapter', () => {
    expect(stepScreen([], { page: 3, atEnd: false }, 1)).toEqual({ page: 0, atEnd: false });
  });
});

describe('snapToScreen and lastVisiblePage', () => {
  const screens = buildScreens(pages, 'double', options);

  it('snaps a page to the first page of its spread', () => {
    expect(snapToScreen(screens, 2)).toBe(1);
    expect(snapToScreen(screens, 5)).toBe(4);
    expect(snapToScreen([], 5)).toBe(0);
  });

  it('reports the furthest page on show', () => {
    expect(lastVisiblePage(screens, { page: 1, atEnd: false })).toBe(2);
    expect(lastVisiblePage(screens, { page: 4, atEnd: true })).toBe(5);
  });
});
