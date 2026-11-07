import { useEffect } from 'react';

import { setAmbient, setGlass, setStrength } from '@/lib/theme/seed';

import type { AppSettings, MotionPreference } from './contract';
import { useSettings } from './store';

/** Motion preference on <html>: `data-motion` is absent for "system". */
export function setMotion(motion: MotionPreference, target?: HTMLElement): void {
  const el = target ?? document.documentElement;
  if (motion === 'system') delete el.dataset.motion;
  else el.dataset.motion = motion;
}

/** Writes the appearance settings onto <html>, where tokens.css and index.css read them. */
export function applyAppearance(settings: AppSettings, target?: HTMLElement): void {
  setStrength(settings['appearance.strength'], target);
  setAmbient(settings['appearance.ambient'], target);
  setGlass(settings['appearance.glass'], target);
  setMotion(settings['appearance.motion'], target);
}

/** Keeps <html> in step with the appearance settings. Mount once, at the app root. */
export function useAppearanceSettings(): void {
  const { settings } = useSettings();
  useEffect(() => applyAppearance(settings), [settings]);
}
