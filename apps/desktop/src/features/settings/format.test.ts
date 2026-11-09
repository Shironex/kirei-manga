import { describe, expect, it } from 'vitest';

import {
  describeClearedSessions,
  describeOrphans,
  describePrune,
  describePurge,
  describeSessions,
  formatAgo,
  plural,
} from './format';

describe('formatAgo', () => {
  const now = 1_700_000_000_000;
  it('reads like a sentence', () => {
    expect(formatAgo(now - 10_000, now)).toBe('just now');
    expect(formatAgo(now - 2 * 60_000, now)).toBe('2 minutes ago');
    expect(formatAgo(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(formatAgo(now - 86_400_000, now)).toBe('yesterday');
  });
});

describe('plural', () => {
  it('uses the singular for one', () => {
    expect(plural(1, 'file')).toBe('1 file');
    expect(plural(1200, 'file')).toBe('1,200 files');
    expect(plural(3, 'series', 'series')).toBe('3 series');
  });
});

describe('cleanup messages', () => {
  it('names what a purge deleted', () => {
    expect(describePurge({ progress: 0, settings: 0 })).toBe(
      'There was no hidden progress to clean up.'
    );
    expect(describePurge({ progress: 1, settings: 0 })).toBe('Deleted 1 progress entry.');
    expect(describePurge({ progress: 12, settings: 2 })).toBe(
      'Deleted 12 progress entries and 2 series settings.'
    );
    expect(describeOrphans({ progress: 0, settings: 1 })).toBe('1 series setting');
    expect(describeOrphans({ progress: 0, settings: 0, shelf: 1 })).toBe('1 empty list entry');
    expect(describePurge({ progress: 3, settings: 1, shelf: 2 })).toBe(
      'Deleted 3 progress entries, 1 series setting and 2 empty list entries.'
    );
  });

  it('reports the space a prune freed', () => {
    expect(describePrune({ bytes: 0, files: 0 })).toMatch(/nothing to remove/);
    expect(describePrune({ bytes: 2_097_152, files: 3 })).toBe(
      'Removed 3 unused thumbnails and freed 2.0 MiB.'
    );
  });
});

describe('reading stats messages', () => {
  it('says how many sessions a clear would delete', () => {
    expect(describeSessions(null)).toBe(
      'Reading time, streaks and the year in review, kept on this computer.'
    );
    expect(describeSessions(0)).toBe('No reading sessions stored. They build up as you read.');
    expect(describeSessions(1)).toBe(
      '1 reading session behind the stats page and the year in review, kept on this computer.'
    );
    expect(describeSessions(1234)).toMatch(/^1,234 reading sessions /);
  });

  it('names what a clear deleted', () => {
    expect(describeClearedSessions(0)).toBe('There were no reading sessions to clear.');
    expect(describeClearedSessions(42)).toBe(
      'Cleared 42 reading sessions. The stats start over from your next chapter.'
    );
  });
});
