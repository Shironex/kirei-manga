import { nearestHue } from './color';

/** Writes the page seed (hue in degrees, chroma) that every token derives from. */
export function setSeed(hue: number, chroma: number): void {
  const root = document.documentElement;
  const current = Number.parseFloat(root.style.getPropertyValue('--seed-h')) || 268;
  root.style.setProperty('--seed-h', nearestHue(current, hue).toFixed(1));
  root.style.setProperty('--seed-c', chroma.toFixed(3));
}
