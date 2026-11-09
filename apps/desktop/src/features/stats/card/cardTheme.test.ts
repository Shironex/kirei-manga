import { describe, expect, it } from 'vitest';

import type { Palette } from '@/lib/library';
import { contrastRatio, composite } from '@/lib/theme/contrast';
import { AA_TEXT, AA_UI } from '@/lib/theme/pairs';
import { SEED_CHROMA_MAX } from '@/lib/theme/seed';

import { brightestBackdrop, cardRoles, cardTheme, rgba } from './cardTheme';

const HUES = Array.from({ length: 24 }, (_, i) => i * 15);
const CHROMAS = [0, 0.04, 0.09, 0.13, SEED_CHROMA_MAX, 0.3];

function worst(pick: (roles: ReturnType<typeof cardRoles>) => number) {
  let low = { ratio: Infinity, h: 0, c: 0 };
  for (const h of HUES) {
    for (const c of CHROMAS) {
      for (const h2 of [h + 40, h + 180]) {
        const ratio = pick(cardRoles(h, c, h2));
        if (ratio < low.ratio) low = { ratio, h, c };
      }
    }
  }
  return low;
}

describe('card colours stay AA for every cover', () => {
  for (const role of ['text', 'textSoft', 'accent'] as const) {
    it(`${role} over the brightest backdrop`, () => {
      const low = worst(roles => contrastRatio(rgba(roles[role]), brightestBackdrop(roles)));
      expect(low.ratio, `worst ${low.ratio.toFixed(2)} at h=${low.h} c=${low.c}`).toBeGreaterThan(
        AA_TEXT
      );
    });
  }

  it('the fullest heatmap cell stands out from an empty one', () => {
    const low = worst(roles => {
      const backdrop = brightestBackdrop(roles);
      return contrastRatio(
        composite(rgba(roles.heat4), backdrop),
        composite(rgba(roles.heat0), backdrop)
      );
    });
    expect(low.ratio).toBeGreaterThan(AA_UI);
  });
});

describe('cardTheme', () => {
  it('turns a cover palette into plain rgba strings a canvas takes', () => {
    const palette: Palette = {
      h: 25,
      c: 0.16,
      swatches: [
        { l: 0.2, c: 0.05, h: 25 },
        { l: 0.5, c: 0.1, h: 25 },
        { l: 0.7, c: 0.16, h: 25 },
        { l: 0.6, c: 0.12, h: 210 },
        { l: 0.9, c: 0.03, h: 25 },
      ],
      fallback: false,
    };
    const theme = cardTheme(palette);
    for (const value of [theme.background, theme.text, theme.accent, ...theme.heat]) {
      expect(value).toMatch(/^rgba\(\d+, \d+, \d+, [\d.]+\)$/);
    }
    expect(theme.glowPrimaryClear.endsWith(', 0)')).toBe(true);
    // A warm cover gives a warm accent: more red than blue.
    const [r, , b] = theme.accent.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(b!);
  });

  it('falls back to the default seed without a cover', () => {
    expect(cardTheme(null)).toEqual(cardTheme(undefined));
  });
});
