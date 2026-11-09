import type { AppSettings, PageFit, ReaderMode, ReadingDirection } from '@/lib/settings/contract';

import type { PageSize } from './spreads';
import { looksLikeWebtoon } from './webtoon';

/**
 * How a title is read: mode, direction, fit and the double page options. The
 * app settings (`reader.*`, see docs/settings.md) give the defaults; a choice
 * made inside the reader is kept per series in the library's series settings
 * under `reader` and wins over them. A chapter opened from a file starts from
 * the defaults and keeps changes for the session only.
 */

export type { ReaderMode };
export type Direction = ReadingDirection;
/**
 * `screen` shows the whole page, `width` fills the width (up to a cap),
 * `height` fills the height, `original` shows one image pixel per device
 * pixel. The last three scroll when the page is larger than the stage.
 */
export type Fit = PageFit;
export type Background = 'glow' | 'flat' | 'tint';

export interface ReaderPrefs {
  mode: ReaderMode;
  direction: Direction;
  fit: Fit;
  background: Background;
  /** Show pages wider than tall alone in double page mode. */
  detectSpreads: boolean;
  coverAlone: boolean;
  shift: boolean;
}

export const DEFAULT_PREFS: ReaderPrefs = {
  mode: 'single',
  direction: 'rtl',
  fit: 'screen',
  background: 'glow',
  detectSpreads: true,
  coverAlone: true,
  shift: false,
};

const MODES: readonly ReaderMode[] = ['single', 'double', 'webtoon'];
const DIRECTIONS: readonly Direction[] = ['ltr', 'rtl'];
const FITS: readonly Fit[] = ['screen', 'width', 'height', 'original'];
const BACKGROUNDS: readonly Background[] = ['glow', 'flat', 'tint'];

function pick<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reads stored prefs, keeping the fallback for anything missing or invalid. */
export function parsePrefs(value: unknown, fallback: ReaderPrefs = DEFAULT_PREFS): ReaderPrefs {
  if (!isRecord(value)) return fallback;
  return {
    mode: pick(MODES, value.mode, fallback.mode),
    direction: pick(DIRECTIONS, value.direction, fallback.direction),
    fit: pick(FITS, value.fit, fallback.fit),
    background: pick(BACKGROUNDS, value.background, fallback.background),
    detectSpreads: flag(value.detectSpreads, fallback.detectSpreads),
    coverAlone: flag(value.coverAlone, fallback.coverAlone),
    shift: flag(value.shift, fallback.shift),
  };
}

/** The defaults the app settings give a title with nothing saved. */
export function prefsFromAppSettings(settings: AppSettings): ReaderPrefs {
  return {
    ...DEFAULT_PREFS,
    mode: settings['reader.mode'],
    direction: settings['reader.direction'],
    fit: settings['reader.fit'],
    detectSpreads: settings['reader.detectSpreads'],
  };
}

/** The `reader` entry of a series settings object. */
export function prefsFromSettings(settings: unknown, fallback: ReaderPrefs): ReaderPrefs {
  return parsePrefs(isRecord(settings) ? settings.reader : undefined, fallback);
}

/**
 * Writes `key` into a series settings object without dropping what other
 * features keep there.
 */
export function mergeSettings(
  settings: unknown,
  key: string,
  value: unknown
): Record<string, unknown> {
  return { ...(isRecord(settings) ? settings : {}), [key]: value };
}

/**
 * Direction a title starts in when nothing is stored: ComicInfo says right to
 * left with `YesAndRightToLeft`, a plain `Yes` (manga) keeps the default, and
 * `No` means a western comic, read left to right.
 */
export function directionFromComicInfo(manga: string | null, fallback: Direction): Direction {
  if (manga === 'YesAndRightToLeft') return 'rtl';
  if (manga === 'No') return 'ltr';
  return fallback;
}

/**
 * The mode the reader chose inside the reader for this series, or `null` when
 * it never chose one. Since webtoon detection, `reader.modeChosen` records
 * that; an entry saved before it counts as a choice only when its mode
 * differs from the app default (the same mode was most likely just written
 * along with another change).
 */
export function chosenMode(settings: unknown, appDefault: ReaderMode): ReaderMode | null {
  const reader = isRecord(settings) ? settings.reader : undefined;
  if (!isRecord(reader)) return null;
  const mode = MODES.includes(reader.mode as ReaderMode) ? (reader.mode as ReaderMode) : null;
  if (reader.modeChosen === true) return mode;
  if (reader.modeChosen === undefined && mode !== appDefault) return mode;
  return null;
}

/**
 * The mode a chapter opens in: the series' own choice, else webtoon for a
 * chapter of tall strips (when detection is on), else the app default.
 */
export function startMode(options: {
  chosen: ReaderMode | null;
  appDefault: ReaderMode;
  detectWebtoon: boolean;
  pages: readonly PageSize[];
}): ReaderMode {
  if (options.chosen) return options.chosen;
  if (options.detectWebtoon && looksLikeWebtoon(options.pages)) return 'webtoon';
  return options.appDefault;
}
