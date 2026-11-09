import type { Palette } from '@/lib/library';
import { composite, oklchToRgba, type Rgba } from '@/lib/theme/contrast';
import { seedFromPalette } from '@/lib/theme/coverTheme';
import { clampChroma, DEFAULT_SEED } from '@/lib/theme/seed';

/**
 * Colours of the year in review card, derived from the cover of the year's
 * most read series the way tokens.css derives the app from its seed: hue and
 * chroma come from the cover, lightness is fixed per role, so contrast holds
 * for any cover. The card is a PNG that leaves the app, so it does not follow
 * the strength setting; it is computed here in sRGB because the canvas paints
 * plain colours (no CSS variables, and not every webview takes oklch()).
 * cardTheme.test.ts holds every text colour to AA over the brightest the
 * background can get, for every hue and chroma.
 */

/** How strongly the blurred cover shows through at the top of the card. */
export const COVER_ALPHA = 0.2;
/** Peak opacity of the two glows. */
export const GLOW_ALPHA = { primary: 0.34, secondary: 0.24 } as const;

export interface CardTheme {
  background: string;
  backgroundDeep: string;
  glowPrimary: string;
  glowSecondary: string;
  /** Glow colours at zero alpha, for the gradient edges. */
  glowPrimaryClear: string;
  glowSecondaryClear: string;
  text: string;
  textSoft: string;
  accent: string;
  line: string;
  panel: string;
  /** Heatmap cells, level 0 (no reading) to 4. */
  heat: [string, string, string, string, string];
}

/** The colour roles in OKLCH, before conversion. Exported for the contrast test. */
export function cardRoles(h: number, c: number, h2: number) {
  const chroma = clampChroma(c);
  const accentC = Math.min(0.15, Math.max(0.06, chroma));
  const tint = Math.min(0.03, chroma * 0.25);
  return {
    background: [0.12, tint, h, 1],
    backgroundDeep: [0.085, tint * 0.6, h, 1],
    glowPrimary: [0.5, Math.max(0.06, chroma), h, GLOW_ALPHA.primary],
    glowSecondary: [0.45, Math.max(0.05, chroma * 0.8), h2, GLOW_ALPHA.secondary],
    text: [0.97, 0.008, h, 1],
    textSoft: [0.86, 0.02, h, 1],
    accent: [0.88, accentC, h, 1],
    line: [0.97, 0.01, h, 0.12],
    panel: [0.97, 0.01, h, 0.05],
    heat0: [0.97, 0.01, h, 0.07],
    heat1: [0.88, accentC, h, 0.3],
    heat2: [0.88, accentC, h, 0.52],
    heat3: [0.88, accentC, h, 0.76],
    heat4: [0.88, accentC, h, 1],
  } satisfies Record<string, [number, number, number, number]>;
}

export type CardRoles = ReturnType<typeof cardRoles>;

export function rgba(role: [number, number, number, number]): Rgba {
  return oklchToRgba(role[0], role[1], role[2], role[3]);
}

export function css({ r, g, b, a }: Rgba): string {
  const byte = (x: number) => Math.round(x * 255);
  return `rgba(${byte(r)}, ${byte(g)}, ${byte(b)}, ${Number(a.toFixed(3))})`;
}

/**
 * The brightest point any text on the card can sit on: the base, a white
 * cover at full strength, and both glows at their peak, stacked.
 */
export function brightestBackdrop(roles: CardRoles): Rgba {
  let out = rgba(roles.background);
  out = composite({ r: 1, g: 1, b: 1, a: COVER_ALPHA }, out);
  out = composite(rgba(roles.glowPrimary), out);
  out = composite(rgba(roles.glowSecondary), out);
  return out;
}

/** The card theme for a cover palette; no palette gives the app's default seed. */
export function cardTheme(palette: Palette | null | undefined): CardTheme {
  const seed = palette ? seedFromPalette(palette) : DEFAULT_SEED;
  const second = palette?.swatches[3];
  const h2 = second && Number.isFinite(second.h) ? second.h : seed.h + 40;
  const roles = cardRoles(seed.h, seed.c, h2);
  const color = (role: [number, number, number, number]) => css(rgba(role));
  const clear = (role: [number, number, number, number]) => css({ ...rgba(role), a: 0 });
  return {
    background: color(roles.background),
    backgroundDeep: color(roles.backgroundDeep),
    glowPrimary: color(roles.glowPrimary),
    glowSecondary: color(roles.glowSecondary),
    glowPrimaryClear: clear(roles.glowPrimary),
    glowSecondaryClear: clear(roles.glowSecondary),
    text: color(roles.text),
    textSoft: color(roles.textSoft),
    accent: color(roles.accent),
    line: color(roles.line),
    panel: color(roles.panel),
    heat: [
      color(roles.heat0),
      color(roles.heat1),
      color(roles.heat2),
      color(roles.heat3),
      color(roles.heat4),
    ],
  };
}
