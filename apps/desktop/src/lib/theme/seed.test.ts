import { describe, expect, it } from 'vitest';

import { clampChroma, SEED_CHROMA_MAX, unwrapHue } from './seed';

describe('unwrapHue', () => {
  it('takes the short way across 0 degrees', () => {
    expect(unwrapHue(350, 10)).toBe(370);
    expect(unwrapHue(10, 350)).toBe(-10);
  });

  it('keeps hues that are already close', () => {
    expect(unwrapHue(268, 300)).toBe(300);
    expect(unwrapHue(268, 268)).toBe(268);
  });

  it('stays near an already unwrapped current hue', () => {
    expect(unwrapHue(725, 20)).toBe(740);
  });
});

describe('clampChroma', () => {
  it('caps vivid covers and floors bad input', () => {
    expect(clampChroma(0.3)).toBe(SEED_CHROMA_MAX);
    expect(clampChroma(0.08)).toBe(0.08);
    expect(clampChroma(-1)).toBe(0);
    expect(clampChroma(Number.NaN)).toBe(0);
  });
});
