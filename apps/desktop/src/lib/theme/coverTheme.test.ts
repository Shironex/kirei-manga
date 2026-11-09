import { beforeEach, describe, expect, it } from 'vitest';

import type { CoverRef } from '@/lib/library';

import {
  currentFocus,
  focusChapterCover,
  focusCover,
  previewCover,
  resetCoverTheme,
  seedFromPalette,
} from './coverTheme';
import { DEFAULT_SEED, SEED_CHROMA_MAX } from './seed';

function cover(hash: string, h: number, c: number): CoverRef {
  return {
    hash,
    path: `/covers/${hash}.jpg`,
    width: 400,
    height: 600,
    palette: { h, c, swatches: [], fallback: false },
  };
}

describe('seedFromPalette', () => {
  it('passes a sane palette through', () => {
    expect(seedFromPalette({ h: 33, c: 0.12 })).toEqual({ h: 33, c: 0.12 });
  });

  it('wraps hues and caps chroma', () => {
    expect(seedFromPalette({ h: -30, c: 0.4 })).toEqual({ h: 330, c: SEED_CHROMA_MAX });
    expect(seedFromPalette({ h: 725, c: -1 })).toEqual({ h: 5, c: 0 });
  });

  it('falls back to the default seed without a usable palette', () => {
    expect(seedFromPalette(null)).toEqual(DEFAULT_SEED);
    expect(seedFromPalette({ h: Number.NaN, c: 0.1 })).toEqual(DEFAULT_SEED);
  });
});

describe('cover focus', () => {
  beforeEach(resetCoverTheme);

  it('shows a preview over the page cover and drops back to it', () => {
    expect(currentFocus()).toBeNull();
    focusCover(cover('a', 40, 0.16));
    expect(currentFocus()).toEqual({ hash: 'a', seed: { h: 40, c: 0.16 } });
    previewCover(cover('b', 200, 0.1));
    expect(currentFocus()?.hash).toBe('b');
    previewCover(null);
    expect(currentFocus()?.hash).toBe('a');
  });

  it('keeps an identical focus object, so subscribers do not rerender', () => {
    focusCover(cover('a', 40, 0.16));
    const first = currentFocus();
    focusCover(cover('a', 40, 0.16));
    expect(currentFocus()).toBe(first);
  });

  it('treats a series without a cover as no focus', () => {
    focusCover(cover('a', 40, 0.16));
    focusCover(null);
    expect(currentFocus()).toBeNull();
  });
});

describe('reader cover focus', () => {
  beforeEach(resetCoverTheme);

  it('takes the colours of the chapter series', () => {
    focusChapterCover(cover('a', 150, 0.12));
    expect(currentFocus()).toEqual({ hash: 'a', seed: { h: 150, c: 0.12 } });
  });

  it('keeps the carried over colours while the chapter loads', () => {
    focusCover(cover('a', 40, 0.16));
    focusChapterCover(undefined);
    expect(currentFocus()?.hash).toBe('a');
  });

  it('drops to the default seed for a file with no series', () => {
    focusCover(cover('a', 40, 0.16));
    focusChapterCover(null);
    expect(currentFocus()).toBeNull();
  });
});
