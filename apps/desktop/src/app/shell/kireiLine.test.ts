import { describe, expect, it } from 'vitest';

import { KIREI_LINES, kireiLine, type KireiMood } from './kireiLine';

const BASE: KireiMood = {
  libraryReady: true,
  seriesCount: 12,
  scanning: false,
  newChapters: 0,
  streakDays: 0,
};

const line = (over: Partial<KireiMood>) => kireiLine({ ...BASE, ...over });

describe('kireiLine', () => {
  it('asks for a folder when the library is empty', () => {
    expect(line({ seriesCount: 0 })).toBe(KIREI_LINES.empty);
  });

  it('stays quiet while the library is still loading', () => {
    expect(line({ libraryReady: false, seriesCount: 0 })).toBe(KIREI_LINES.quiet);
  });

  it('says it is looking while a scan runs, even on an empty library', () => {
    expect(line({ scanning: true })).toBe(KIREI_LINES.scanning);
    expect(line({ scanning: true, seriesCount: 0 })).toBe(KIREI_LINES.scanning);
  });

  it('counts new chapters, singular and plural', () => {
    expect(line({ newChapters: 1 })).toBe('1 new chapter is waiting for you.');
    expect(line({ newChapters: 7 })).toBe('7 new chapters are waiting for you.');
  });

  it('prefers new chapters over a streak', () => {
    expect(line({ newChapters: 2, streakDays: 15 })).toContain('new chapters');
  });

  it('mentions a streak from three days', () => {
    expect(line({ streakDays: 15 })).toBe('15 days of reading in a row. Lovely.');
    expect(line({ streakDays: 3 })).toContain('3 days');
    expect(line({ streakDays: 2 })).toBe(KIREI_LINES.quiet);
  });

  it('falls back to the quiet line', () => {
    expect(line({})).toBe(KIREI_LINES.quiet);
  });

  it('never shows the add-a-folder hint for a library with series', () => {
    for (const newChapters of [0, 3]) {
      for (const streakDays of [0, 9]) {
        for (const scanning of [false, true]) {
          expect(line({ newChapters, streakDays, scanning })).not.toBe(KIREI_LINES.empty);
        }
      }
    }
  });

  it('is deterministic', () => {
    expect(line({ newChapters: 4 })).toBe(line({ newChapters: 4 }));
  });
});
