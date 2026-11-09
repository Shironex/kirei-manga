import { describe, expect, it } from 'vitest';

import { DEFAULT_PREFS } from '../model/prefs';
import { initialPrefs } from './useReaderPrefs';

const strips = [
  { width: 800, height: 6000 },
  { width: 800, height: 6000 },
];

describe('initialPrefs', () => {
  it('opens a series of tall strips in webtoon while it has no mode of its own', () => {
    const chapter = {
      seriesId: 1,
      settings: { reader: { fit: 'width' } },
      manga: null,
      pages: strips,
    };
    expect(initialPrefs(chapter, DEFAULT_PREFS, true)).toEqual({
      prefs: { ...DEFAULT_PREFS, fit: 'width', mode: 'webtoon' },
      modeChosen: false,
    });
  });

  it('keeps the mode a series chose, and the page shift it saved', () => {
    const settings = { reader: { mode: 'double', modeChosen: true, shift: true } };
    const chapter = { seriesId: 1, settings, manga: null, pages: strips };
    expect(initialPrefs(chapter, DEFAULT_PREFS, true)).toEqual({
      prefs: { ...DEFAULT_PREFS, mode: 'double', shift: true },
      modeChosen: true,
    });
  });

  it('detects webtoon for a file too, and never with detection off', () => {
    const file = { seriesId: null, settings: null, manga: null, pages: strips };
    expect(initialPrefs(file, DEFAULT_PREFS, true).prefs.mode).toBe('webtoon');
    expect(initialPrefs(file, DEFAULT_PREFS, false).prefs.mode).toBe('single');
  });
});
