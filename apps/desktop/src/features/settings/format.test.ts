import { describe, expect, it } from 'vitest';

import { describeOrphans, describePrune, describePurge, formatAgo, plural } from './format';

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
  });

  it('reports the space a prune freed', () => {
    expect(describePrune({ bytes: 0, files: 0 })).toMatch(/nothing to remove/);
    expect(describePrune({ bytes: 2_097_152, files: 3 })).toBe(
      'Removed 3 unused thumbnails and freed 2.0 MiB.'
    );
  });
});
