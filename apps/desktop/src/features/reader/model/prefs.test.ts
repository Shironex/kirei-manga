import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '@/lib/settings/contract';

import {
  chosenMode,
  DEFAULT_PREFS,
  directionFromComicInfo,
  mergeSettings,
  parsePrefs,
  prefsFromAppSettings,
  prefsFromSettings,
  startMode,
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

describe('chosenMode', () => {
  it('reads a mode the reader chose', () => {
    expect(chosenMode({ reader: { mode: 'single', modeChosen: true } }, 'single')).toBe('single');
    expect(chosenMode({ reader: { mode: 'webtoon', modeChosen: false } }, 'single')).toBeNull();
  });

  it('treats older entries as a choice only when they differ from the default', () => {
    expect(chosenMode({ reader: { mode: 'double' } }, 'single')).toBe('double');
    expect(chosenMode({ reader: { mode: 'single' } }, 'single')).toBeNull();
    expect(chosenMode(null, 'single')).toBeNull();
    expect(chosenMode({ reader: { mode: 'sideways', modeChosen: true } }, 'single')).toBeNull();
  });
});

describe('startMode', () => {
  const strips = [{ width: 800, height: 6000 }];
  const pages = [{ width: 1200, height: 1800 }];

  it('opens tall strip chapters in webtoon unless the series chose a mode', () => {
    const base = { chosen: null, appDefault: 'single' as const, detectWebtoon: true };
    expect(startMode({ ...base, pages: strips })).toBe('webtoon');
    expect(startMode({ ...base, pages })).toBe('single');
    expect(startMode({ ...base, chosen: 'double', pages: strips })).toBe('double');
    expect(startMode({ ...base, detectWebtoon: false, pages: strips })).toBe('single');
  });
});
