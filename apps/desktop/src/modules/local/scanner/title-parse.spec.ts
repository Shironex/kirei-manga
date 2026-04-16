import { cleanTitle, parseChapterNumber, parseVolumeNumber } from './title-parse';

describe('parseChapterNumber', () => {
  it.each([
    ['Chapter 12.cbz', 12],
    ['ch.42', 42],
    ['c_07', 7],
    ['ch 12.5.cbz', 12.5],
    ['Chapter_100', 100],
    ['Series Name - Chapter 5', 5],
  ])('matches %s → %s', (input, expected) => {
    expect(parseChapterNumber(input)).toBe(expected);
  });

  it('returns null when no chapter pattern is found', () => {
    expect(parseChapterNumber('Extra')).toBeNull();
    expect(parseChapterNumber('Omake.cbz')).toBeNull();
  });
});

describe('parseVolumeNumber', () => {
  it.each([
    ['Volume 3', 3],
    ['vol_02', 2],
    ['V.10', 10],
    ['Volume 01 Extra', 1],
  ])('matches %s → %s', (input, expected) => {
    expect(parseVolumeNumber(input)).toBe(expected);
  });

  it('ignores non-volume v-prefixes inside longer words', () => {
    expect(parseVolumeNumber('versus')).toBeNull();
  });
});

describe('cleanTitle', () => {
  it('strips bracket tags and collapses separators', () => {
    expect(cleanTitle('[Raw] My_Series.Name (v2)')).toBe('My Series Name');
  });

  it('trims whitespace', () => {
    expect(cleanTitle('   Series   ')).toBe('Series');
  });

  it('keeps the raw title intact when nothing matches', () => {
    expect(cleanTitle('Plain Title')).toBe('Plain Title');
  });
});
