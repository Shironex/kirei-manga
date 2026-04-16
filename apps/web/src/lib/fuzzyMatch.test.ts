import { describe, expect, it } from 'vitest';
import { fuzzyIncludes } from './fuzzyMatch';

describe('fuzzyIncludes', () => {
  it('returns true for an empty query', () => {
    expect(fuzzyIncludes('Berserk', '')).toBe(true);
  });

  it('returns true for a whitespace-only query', () => {
    expect(fuzzyIncludes('Berserk', '   \t\n')).toBe(true);
  });

  it('matches an exact substring', () => {
    expect(fuzzyIncludes('Berserk', 'berserk')).toBe(true);
  });

  it('is case-insensitive on both sides', () => {
    expect(fuzzyIncludes('BERSERK', 'berserk')).toBe(true);
    expect(fuzzyIncludes('berserk', 'BERSERK')).toBe(true);
    expect(fuzzyIncludes('Berserk', 'Ber')).toBe(true);
  });

  it('matches a needle found somewhere inside the haystack', () => {
    expect(fuzzyIncludes('The Apothecary Diaries', 'apothecary')).toBe(true);
  });

  it('matches when all whitespace-split tokens appear (in any order)', () => {
    expect(fuzzyIncludes('The Apothecary Diaries', 'diaries apothecary')).toBe(true);
  });

  it('fails when any token is missing', () => {
    expect(fuzzyIncludes('The Apothecary Diaries', 'diaries pharmacy')).toBe(false);
  });

  it('returns false when the needle is not a substring', () => {
    expect(fuzzyIncludes('Berserk', 'vinland')).toBe(false);
  });

  it('collapses runs of whitespace between tokens', () => {
    expect(fuzzyIncludes('The Apothecary Diaries', '  the    diaries  ')).toBe(true);
  });

  it('trims surrounding whitespace before checking', () => {
    expect(fuzzyIncludes('Berserk', '  berserk  ')).toBe(true);
  });

  it('handles an empty haystack with a non-empty query', () => {
    expect(fuzzyIncludes('', 'anything')).toBe(false);
  });

  it('handles an empty haystack with an empty query', () => {
    expect(fuzzyIncludes('', '')).toBe(true);
  });
});
