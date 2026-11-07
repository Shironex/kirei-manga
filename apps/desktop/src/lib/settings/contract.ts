import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

/**
 * App settings contract, mirrored from `kirei_core::AppSettings` (Rust is the
 * source of truth for validation and defaults). Keys are documented in
 * docs/settings.md. Components read settings through `useSetting` in
 * `./store`, never through these wrappers directly.
 */

export type ThemeStrength = 'subtle' | 'balanced' | 'vivid';
export type MotionPreference = 'system' | 'reduced' | 'full';
export type ReaderMode = 'single' | 'double' | 'webtoon';
export type ReadingDirection = 'rtl' | 'ltr';
export type PageFit = 'screen' | 'width' | 'height' | 'original';
export type ResampleFilter = 'lanczos3' | 'mitchell' | 'nearest';

export interface AppSettings {
  'appearance.strength': ThemeStrength;
  'appearance.ambient': boolean;
  'appearance.glass': boolean;
  'appearance.motion': MotionPreference;
  'reader.mode': ReaderMode;
  'reader.direction': ReadingDirection;
  'reader.fit': PageFit;
  'reader.filter': ResampleFilter;
  'reader.detectSpreads': boolean;
}

export type SettingKey = keyof AppSettings;

/** Same values as `AppSettings::default()` in Rust; a test keeps them honest. */
export const DEFAULT_SETTINGS: Readonly<AppSettings> = Object.freeze({
  'appearance.strength': 'balanced',
  'appearance.ambient': true,
  'appearance.glass': true,
  'appearance.motion': 'system',
  'reader.mode': 'single',
  'reader.direction': 'rtl',
  'reader.fit': 'screen',
  'reader.filter': 'lanczos3',
  'reader.detectSpreads': true,
});

export const SETTINGS_CHANGED_EVENT = 'settings:changed';

export function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>('settings_get');
}

/** Resolves with every setting now in effect; rejects with the reason a value was refused. */
export function setSetting<K extends SettingKey>(
  key: K,
  value: AppSettings[K]
): Promise<AppSettings> {
  return invoke<AppSettings>('settings_set', { key, value });
}

export function onSettingsChanged(handler: (settings: AppSettings) => void): Promise<UnlistenFn> {
  return listen<AppSettings>(SETTINGS_CHANGED_EVENT, event => handler(event.payload));
}
