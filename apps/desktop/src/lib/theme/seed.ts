/**
 * Runtime theme seed. tokens.css derives every surface, accent and glow from
 * --seed-h (hue) and --seed-c (chroma), scaled by --strength. The cover sampler
 * (issue #33) calls applySeed with the dominant vivid colour of the cover in focus;
 * until then the token defaults (hue 268, chroma 0.13) stay in place.
 */

export interface Seed {
  /** Hue in degrees, any value; it is unwrapped against the current hue. */
  h: number;
  /** Chroma of the dominant vivid colour. Capped at SEED_CHROMA_MAX. */
  c: number;
}

export type Strength = 'subtle' | 'balanced' | 'vivid';

/** The cap tokens.css documents for --seed-c: above it the accent turns garish. */
export const SEED_CHROMA_MAX = 0.17;

export const DEFAULT_SEED: Seed = { h: 268, c: 0.13 };

export const STRENGTH_SCALE: Record<Strength, number> = {
  subtle: 0.6,
  balanced: 1,
  vivid: 1.35,
};

/**
 * Picks the equivalent of `next` closest to `current`, so the 900 ms palette
 * crossfade always takes the short way round the hue circle (350 to 10 moves
 * +20 degrees, not -340).
 */
export function unwrapHue(current: number, next: number): number {
  const delta = ((((next - current) % 360) + 540) % 360) - 180;
  return current + delta;
}

export function clampChroma(c: number): number {
  if (!Number.isFinite(c) || c < 0) return 0;
  return Math.min(c, SEED_CHROMA_MAX);
}

function root(target?: HTMLElement): HTMLElement {
  return target ?? document.documentElement;
}

function currentHue(el: HTMLElement): number {
  const inline = Number.parseFloat(el.style.getPropertyValue('--seed-h'));
  if (Number.isFinite(inline)) return inline;
  const computed = Number.parseFloat(getComputedStyle(el).getPropertyValue('--seed-h'));
  return Number.isFinite(computed) ? computed : DEFAULT_SEED.h;
}

/** Writes a new seed; the registered custom properties animate the change. */
export function applySeed(seed: Seed, target?: HTMLElement): void {
  const el = root(target);
  const h = unwrapHue(currentHue(el), seed.h);
  el.style.setProperty('--seed-h', h.toFixed(2));
  el.style.setProperty('--seed-c', clampChroma(seed.c).toFixed(4));
}

export function resetSeed(target?: HTMLElement): void {
  applySeed(DEFAULT_SEED, target);
}

export function setStrength(strength: Strength, target?: HTMLElement): void {
  root(target).style.setProperty('--strength', String(STRENGTH_SCALE[strength]));
}

/** Glass panels preference. Off falls back to solid ink-2, like reduced transparency. */
export function setGlass(enabled: boolean, target?: HTMLElement): void {
  const el = root(target);
  if (enabled) delete el.dataset.glass;
  else el.dataset.glass = 'off';
}

/** Ambient cover glow preference. Off hides the glow behind page headers. */
export function setAmbient(enabled: boolean, target?: HTMLElement): void {
  const el = root(target);
  if (enabled) delete el.dataset.ambient;
  else el.dataset.ambient = 'off';
}

/** Current preferences as written on <html>, for controls that reflect them. */
export function readPreferences(target?: HTMLElement): {
  strength: Strength;
  glass: boolean;
  ambient: boolean;
} {
  const el = root(target);
  const scale = Number.parseFloat(el.style.getPropertyValue('--strength'));
  const strength =
    (Object.entries(STRENGTH_SCALE).find(([, v]) => v === scale)?.[0] as Strength | undefined) ??
    'balanced';
  return { strength, glass: el.dataset.glass !== 'off', ambient: el.dataset.ambient !== 'off' };
}
