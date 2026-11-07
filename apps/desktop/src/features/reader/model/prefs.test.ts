import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/lib/settings/contract';

import {
  DEFAULT_PREFS,
  directionFromComicInfo,
  mergeSettings,
  parsePrefs,
  prefsFromAppSettings,
  prefsFromSettings,
} from './prefs';

describe('parsePrefs', () => {
  it('keeps valid fields and falls back for the rest', () => {
    expect(parsePrefs({ mode: 'webtoon', direction: 'sideways', shift: true })).toEqual({
      ...DEFAULT_PREFS,
      mode: 'webtoon',
      shift: true,
    });
  });

  it('returns the fallback for anything that is not an object', () => {
    expect(parsePrefs(null)).toBe(DEFAULT_PREFS);
    expect(parsePrefs('double')).toBe(DEFAULT_PREFS);
    expect(parsePrefs([1, 2])).toBe(DEFAULT_PREFS);
  });
});

describe('prefsFromAppSettings', () => {
  it('takes the reader defaults from the app settings', () => {
    expect(prefsFromAppSettings(DEFAULT_SETTINGS)).toEqual(DEFAULT_PREFS);
    const custom = prefsFromAppSettings({
      ...DEFAULT_SETTINGS,
      'reader.mode': 'webtoon',
      'reader.fit': 'original',
      'reader.detectSpreads': false,
    });
    expect(custom).toMatchObject({ mode: 'webtoon', fit: 'original', detectSpreads: false });
  });
});

describe('series settings', () => {
  it('reads the reader entry', () => {
    const fallback = { ...DEFAULT_PREFS, direction: 'ltr' as const };
    expect(prefsFromSettings({ reader: { mode: 'double' } }, fallback)).toEqual({
      ...fallback,
      mode: 'double',
    });
    expect(prefsFromSettings(null, fallback)).toBe(fallback);
  });

  it('merges one entry without dropping the others', () => {
    expect(mergeSettings({ adjust: { brightness: 90 } }, 'reader', { mode: 'single' })).toEqual({
      adjust: { brightness: 90 },
      reader: { mode: 'single' },
    });
    expect(mergeSettings(null, 'reader', 1)).toEqual({ reader: 1 });
  });
});

describe('directionFromComicInfo', () => {
  it('follows the ComicInfo Manga field', () => {
    expect(directionFromComicInfo('YesAndRightToLeft', 'ltr')).toBe('rtl');
    expect(directionFromComicInfo('No', 'rtl')).toBe('ltr');
    expect(directionFromComicInfo('Yes', 'ltr')).toBe('ltr');
    expect(directionFromComicInfo(null, 'rtl')).toBe('rtl');
  });
});
