/**
 * The blurred cover behind the top of the page. The image is dimmed to a
 * ceiling before it is shown, so even a white cover at full opacity stays dark
 * enough for the text drawn over it; contrast.test.ts holds the hero text to
 * AA against that worst case for every seed and strength.
 */
export const AMBIENT_COVER = {
  /** CSS brightness() applied after the blur: white becomes this sRGB grey. */
  brightness: 0.4,
  /** Image opacity before strength scales it: every page, and the series page. */
  opacity: { page: 0.5, series: 0.85 },
  /** Ink veil laid over the image at the top of the page. */
  scrim: 0.35,
} as const;

/** The brightest the dimmed cover can be, as an OKLCH grey at its opacity for `strength`. */
export function ambientCoverCeiling(strength: number, where: 'page' | 'series'): string {
  const b = AMBIENT_COVER.brightness;
  const linear = b <= 0.04045 ? b / 12.92 : ((b + 0.055) / 1.055) ** 2.4;
  const alpha = Math.min(1, AMBIENT_COVER.opacity[where] * strength);
  return `oklch(${Math.cbrt(linear).toFixed(4)} 0 0 / ${alpha.toFixed(3)})`;
}

/** The veil over the image, in the same terms as tokens.css. */
export const AMBIENT_SCRIM = `oklch(0.13 var(--tint) var(--seed-h) / ${AMBIENT_COVER.scrim})`;
