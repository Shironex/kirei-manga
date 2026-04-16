import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime, relativeFromIso } from './relativeTime';

const NOW = new Date('2026-04-16T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('formatRelativeTime — past values (en)', () => {
  it('formats seconds for a few seconds ago', () => {
    const out = formatRelativeTime(new Date(NOW - 5_000), 'en');
    expect(out).toMatch(/5\s*seconds?\s*ago/i);
  });

  it('formats minutes in the past', () => {
    const out = formatRelativeTime(new Date(NOW - 5 * 60_000), 'en');
    expect(out).toMatch(/5\s*minutes?\s*ago/i);
  });

  it('formats hours in the past', () => {
    const out = formatRelativeTime(new Date(NOW - 3 * 60 * 60_000), 'en');
    expect(out).toMatch(/3\s*hours?\s*ago/i);
  });

  it('formats "yesterday" for ~1 day ago (numeric: auto)', () => {
    const out = formatRelativeTime(new Date(NOW - 24 * 60 * 60_000), 'en');
    expect(out.toLowerCase()).toContain('yesterday');
  });

  it('formats multi-day ranges in days', () => {
    const out = formatRelativeTime(new Date(NOW - 3 * 24 * 60 * 60_000), 'en');
    expect(out).toMatch(/3\s*days?\s*ago/i);
  });

  it('formats weeks for ~14 days ago', () => {
    const out = formatRelativeTime(new Date(NOW - 14 * 24 * 60 * 60_000), 'en');
    expect(out).toMatch(/2\s*weeks?\s*ago/i);
  });

  it('formats months for ~45 days ago', () => {
    const out = formatRelativeTime(new Date(NOW - 45 * 24 * 60 * 60_000), 'en');
    expect(out).toMatch(/months?\s*ago/i);
  });

  it('formats years for ~2 years ago', () => {
    const out = formatRelativeTime(new Date(NOW - 2 * 365 * 24 * 60 * 60_000), 'en');
    expect(out).toMatch(/2\s*years?\s*ago/i);
  });
});

describe('formatRelativeTime — future values (en)', () => {
  it('formats "in N minutes" for positive offsets', () => {
    const out = formatRelativeTime(new Date(NOW + 5 * 60_000), 'en');
    expect(out).toMatch(/in\s*5\s*minutes?/i);
  });
});

describe('formatRelativeTime — input types', () => {
  it('accepts a number (ms since epoch)', () => {
    const out = formatRelativeTime(NOW - 60_000, 'en');
    expect(out).toMatch(/minute/i);
  });

  it('accepts an ISO string', () => {
    const out = formatRelativeTime(new Date(NOW - 60_000).toISOString(), 'en');
    expect(out).toMatch(/minute/i);
  });

  it('returns "" for NaN-producing inputs', () => {
    expect(formatRelativeTime('not-a-date', 'en')).toBe('');
    expect(formatRelativeTime(Number.NaN, 'en')).toBe('');
  });
});

describe('formatRelativeTime — locale fallback', () => {
  it('uses the polish locale when requested', () => {
    const out = formatRelativeTime(new Date(NOW - 5 * 60_000), 'pl');
    expect(out.toLowerCase()).toContain('minut');
  });

  it('falls back to en for an unknown locale rather than throwing', () => {
    expect(() => formatRelativeTime(new Date(NOW - 60_000), 'zz-ZZ')).not.toThrow();
  });
});

describe('relativeFromIso', () => {
  it('delegates to formatRelativeTime', () => {
    const out = relativeFromIso(new Date(NOW - 60_000).toISOString(), 'en');
    expect(out).toMatch(/minute/i);
  });

  it('defaults to English when no locale passed', () => {
    const out = relativeFromIso(new Date(NOW - 5 * 60_000).toISOString());
    expect(out).toMatch(/5\s*minutes?\s*ago/i);
  });
});
