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
import { AMBIENT_SCRIM, ambientCoverCeiling } from './ambient';
import { seedFromPalette } from './coverTheme';
import { AA_TEXT, BACKDROP_TEXT, CONTRAST_PAIRS } from './pairs';
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

/** Palettes the scanner could store for extreme covers, plus malformed ones. */
const EXTREME_PALETTES = [
  { h: 29, c: 0.26, name: 'pure red, chroma above the cap' },
  { h: 110, c: 0.21, name: 'acid yellow' },
  { h: 142, c: 0.29, name: 'pure green' },
  { h: 195, c: 0.15, name: 'cyan' },
  { h: 264, c: 0.31, name: 'pure blue' },
  { h: 328, c: 0.3, name: 'magenta' },
  { h: 272, c: 0.04, name: 'grey cover, scanner fallback' },
  { h: 0, c: 0, name: 'black and white' },
  { h: -30, c: 0.1, name: 'negative hue' },
  { h: 1080.5, c: 0.1, name: 'hue past a full turn' },
  { h: Number.NaN, c: 0.1, name: 'broken hue' },
  { h: 40, c: -1, name: 'negative chroma' },
];

describe('cover palettes', () => {
  for (const palette of EXTREME_PALETTES) {
    it(`${palette.name} maps to a seed the tokens keep at AA`, () => {
      const seed = seedFromPalette(palette);
      expect(seed.h).toBeGreaterThanOrEqual(0);
      expect(seed.h).toBeLessThan(360);
      expect(seed.c).toBeGreaterThanOrEqual(0);
      expect(seed.c).toBeLessThanOrEqual(SEED_CHROMA_MAX);
      for (const strength of Object.values(STRENGTH_SCALE)) {
        const color = makeResolver(tokens, { ...seed, strength });
        for (const pair of CONTRAST_PAIRS) {
          const ratio = contrastRatio(color(...pair.fg), color(...pair.bg));
          expect(ratio, `${pair.use} at strength ${strength}`).toBeGreaterThanOrEqual(pair.min);
        }
      }
    });
  }
});

describe('hero text over the cover backdrop', () => {
  const layered = (strength: number) => {
    const extra = new Map(tokens);
    extra.set('--ambient-cover-page', ambientCoverCeiling(strength, 'page'));
    extra.set('--ambient-cover-series', ambientCoverCeiling(strength, 'series'));
    extra.set('--ambient-scrim', AMBIENT_SCRIM);
    return extra;
  };
  const STACKS: { name: string; layers: [string, ...string[]] }[] = [
    { name: 'the glow alone', layers: ['--ink-0', '--ambient'] },
    {
      name: 'a white cover on a page',
      layers: ['--ink-0', '--ambient', '--ambient-cover-page', '--ambient-scrim'],
    },
    {
      name: 'a white cover on the series page',
      layers: ['--ink-0', '--ambient', '--ambient-cover-series', '--ambient-scrim'],
    },
  ];
  for (const text of BACKDROP_TEXT) {
    for (const stack of STACKS) {
      it(`${text.use} (${text.fg}) over ${stack.name} >= ${AA_TEXT}`, () => {
        let worst = { ratio: Infinity, seed: { h: 0, c: 0, strength: 1 } };
        for (const seed of SEEDS) {
          const color = makeResolver(layered(seed.strength), seed);
          const ratio = contrastRatio(color(text.fg), color(...stack.layers));
          if (ratio < worst.ratio) worst = { ratio, seed };
        }
        expect(
          worst.ratio,
          `worst ${worst.ratio.toFixed(2)}:1 at h=${worst.seed.h} c=${worst.seed.c} strength=${worst.seed.strength}`
        ).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }
});
