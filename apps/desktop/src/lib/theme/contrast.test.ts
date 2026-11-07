import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  evalNumber,
  luminance,
  makeResolver,
  oklchToRgba,
  parseColor,
  parseRootTokens,
} from './contrast';
import { CONTRAST_PAIRS } from './pairs';
import { SEED_CHROMA_MAX, STRENGTH_SCALE } from './seed';

const tokens = parseRootTokens(
  readFileSync(new URL('../../styles/tokens.css', import.meta.url), 'utf8')
);

/** Every hue in 15 degree steps, grey to the chroma cap, at all three strengths. */
const SEEDS = (() => {
  const out: { h: number; c: number; strength: number }[] = [];
  for (let h = 0; h < 360; h += 15) {
    for (const c of [0, 0.04, 0.09, 0.13, SEED_CHROMA_MAX]) {
      for (const strength of Object.values(STRENGTH_SCALE)) out.push({ h, c, strength });
    }
  }
  return out;
})();

describe('token math', () => {
  it('evaluates calc and clamp', () => {
    expect(evalNumber('calc(0.13 * 0.09 * 1)')).toBeCloseTo(0.0117);
    expect(evalNumber('clamp(0.045, calc(0.3 * 1.35), 0.17)')).toBe(0.17);
    expect(evalNumber('clamp(0.045, calc(0 * 1), 0.17)')).toBe(0.045);
  });

  it('converts OKLCH white and black to sRGB', () => {
    expect(luminance(oklchToRgba(1, 0, 0))).toBeCloseTo(1, 3);
    expect(luminance(oklchToRgba(0, 0, 0))).toBeCloseTo(0, 6);
    const white = parseColor('oklch(1 0 0)');
    const black = parseColor('oklch(0 0 0)');
    expect(contrastRatio(white, black)).toBeCloseTo(21, 1);
  });

  it('keeps at least the 5.6:1 tokens.css documents for fg-3 on ink-0', () => {
    const color = makeResolver(tokens, { h: 268, c: 0.13, strength: 1 });
    expect(contrastRatio(color('--fg-3'), color('--ink-0'))).toBeGreaterThanOrEqual(5.6);
  });
});

describe('WCAG AA across every cover seed', () => {
  for (const pair of CONTRAST_PAIRS) {
    it(`${pair.use}: ${pair.fg.join(' over ')} on ${pair.bg.join(' + ')} >= ${pair.min}`, () => {
      let worst = { ratio: Infinity, seed: { h: 0, c: 0, strength: 1 } };
      for (const seed of SEEDS) {
        const color = makeResolver(tokens, seed);
        const ratio = contrastRatio(color(...pair.fg), color(...pair.bg));
        if (ratio < worst.ratio) worst = { ratio, seed };
      }
      expect(
        worst.ratio,
        `worst ${worst.ratio.toFixed(2)}:1 at h=${worst.seed.h} c=${worst.seed.c} strength=${worst.seed.strength}`
      ).toBeGreaterThanOrEqual(pair.min);
    });
  }
});
