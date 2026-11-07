import type { ResampleFilter } from '@/lib/settings/contract';

/**
 * Image adjustments for the reader: what can be tuned, the defaults, and how
 * each one is applied.
 *
 * The split: tone and colour (brightness, contrast, saturation, warmth,
 * grayscale, invert) are CSS filters on the page images. They are exact (the
 * Filter Effects spec defines each as a fixed linear map on the colour, the
 * same arithmetic the pipeline would do), run on the GPU, follow a slider
 * live, never re-render or re-fetch a page, and also reach the pages the
 * pipeline passes through untouched (GIF, AVIF, JPEG XL). Resampling and
 * sharpening run in Rust (`set_render_quality`): the browser has no choice of
 * resize filter, and an unsharp mask is a neighbourhood operation CSS cannot
 * express without an SVG filter repainted on every frame.
 */

export type Resample = ResampleFilter;

export interface Adjustments {
  /** Percent, 100 is unchanged. */
  brightness: number;
  /** Percent, 100 is unchanged. */
  contrast: number;
  /** Percent, 100 is unchanged, 0 is gray. */
  saturation: number;
  /** Unsharp mask strength, 0 (off) to 100, applied in the pipeline. */
  sharpen: number;
  /** Sepia toning, 0 to 100: warmer paper for long sessions. */
  warmth: number;
  /** Light pages turn dark with their hues kept, for night reading. */
  invert: boolean;
  grayscale: boolean;
  resample: Resample;
}

export type NumericAdjustment = 'brightness' | 'contrast' | 'saturation' | 'sharpen' | 'warmth';

/** Slider ranges, in percent. */
export const RANGES: Record<NumericAdjustment, readonly [min: number, max: number]> = {
  brightness: [50, 150],
  contrast: [50, 150],
  saturation: [0, 200],
  sharpen: [0, 100],
  warmth: [0, 100],
};

export const RESAMPLES: readonly Resample[] = ['lanczos3', 'mitchell', 'nearest'];

/** Neutral adjustments with the resampling filter from the app settings. */
export function defaultAdjustments(resample: Resample = 'lanczos3'): Adjustments {
  return {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    sharpen: 0,
    warmth: 0,
    invert: false,
    grayscale: false,
    resample,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function percent(key: NumericAdjustment, value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const [min, max] = RANGES[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Reads stored adjustments, clamping numbers and keeping the fallback for anything invalid. */
export function parseAdjustments(value: unknown, fallback: Adjustments): Adjustments {
  if (!isRecord(value)) return fallback;
  return {
    brightness: percent('brightness', value.brightness, fallback.brightness),
    contrast: percent('contrast', value.contrast, fallback.contrast),
    saturation: percent('saturation', value.saturation, fallback.saturation),
    sharpen: percent('sharpen', value.sharpen, fallback.sharpen),
    warmth: percent('warmth', value.warmth, fallback.warmth),
    invert: typeof value.invert === 'boolean' ? value.invert : fallback.invert,
    grayscale: typeof value.grayscale === 'boolean' ? value.grayscale : fallback.grayscale,
    resample: RESAMPLES.includes(value.resample as Resample)
      ? (value.resample as Resample)
      : fallback.resample,
  };
}

/**
 * What a series remembers, from the `adjust` entry of its settings: missing
 * means nothing saved yet (remember is on by default), `null` means the reader
 * chose not to remember, an object is the saved adjustments.
 */
export function adjustmentsFromSettings(
  settings: unknown,
  fallback: Adjustments
): { adjustments: Adjustments; remember: boolean } {
  const stored = isRecord(settings) ? settings.adjust : undefined;
  if (stored === null) return { adjustments: fallback, remember: false };
  return { adjustments: parseAdjustments(stored, fallback), remember: true };
}

/**
 * The CSS `filter` for the tone and colour adjustments, `none` when neutral.
 * Invert comes first, so brightness and contrast act on what is on screen
 * (dimming an inverted page dims its light lines, not its dark paper).
 * `hue-rotate(180deg)` after `invert(1)` turns the hues back, so a red stays
 * red on a dark page.
 */
export function cssFilter(adjustments: Adjustments): string {
  const parts: string[] = [];
  const { brightness, contrast, saturation, warmth, invert, grayscale } = adjustments;
  if (invert) parts.push('invert(1)', 'hue-rotate(180deg)');
  if (grayscale) parts.push('grayscale(1)');
  else if (saturation !== 100) parts.push(`saturate(${saturation / 100})`);
  if (warmth > 0) parts.push(`sepia(${warmth / 100})`);
  if (brightness !== 100) parts.push(`brightness(${brightness / 100})`);
  if (contrast !== 100) parts.push(`contrast(${contrast / 100})`);
  return parts.length > 0 ? parts.join(' ') : 'none';
}

/** True when nothing differs from `defaults`, so Reset has nothing to do. */
export function isNeutral(adjustments: Adjustments, defaults: Adjustments): boolean {
  return (Object.keys(defaults) as Array<keyof Adjustments>).every(
    key => adjustments[key] === defaults[key]
  );
}
