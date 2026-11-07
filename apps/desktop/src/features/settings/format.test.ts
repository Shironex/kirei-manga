import { describe, expect, it } from 'vitest';

import { formatAgo, plural } from './format';

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
