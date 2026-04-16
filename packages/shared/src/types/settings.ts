/**
 * Settings Types — user-facing application settings persisted by the desktop
 * via electron-store under the key `app.settings`. The renderer mirrors this
 * via the `settings:*` IPC and patches reactively on `settings:updated`.
 *
 * Per-series reader prefs (stored in SQLite) override `reader` defaults; the
 * defaults only apply on the first read of a new series.
 */

import type { ReaderMode, ReaderDirection, FitMode } from './reader';

/** Visual theme. `sumi` = ink-dark (default); `washi` = paper-light. */
export type Theme = 'sumi' | 'washi';

/** Application font scale step. Maps to a CSS variable on `<html>`. */
export type FontSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

/**
 * Reading-surface font family.
 * - fraunces: editorial serif (default — narrative match).
 * - mincho:   Shippori Mincho (already loaded for Japanese kanji).
 * - serif:    generic system serif.
 * - sans:     sans-serif fallback.
 */
export type ReadingFont = 'fraunces' | 'mincho' | 'serif' | 'sans';

/** UI language. v0.1 ships English only; Polish is wired ahead of i18n. */
export type Language = 'en' | 'pl';

export interface AppearanceSettings {
  theme: Theme;
  fontSize: FontSize;
  readingFont: ReadingFont;
}

/**
 * Default reader preferences applied to a series the user hasn't customised.
 * `language` is the default chapter feed language for *new* reads — it does
 * not live on `ReaderSettings` (per-series) which only carries layout.
 */
export interface ReaderDefaults {
  mode: ReaderMode;
  direction: ReaderDirection;
  fit: FitMode;
  /** ISO 639-1 language code, e.g. `en`. */
  language: string;
}

export interface LibrarySettings {
  /** ISO 639-1 chapter language used when seeding the SeriesDetail filter. */
  defaultChapterLanguage: string;
}

/**
 * Keyboard shortcut bindings. v0.1 ships a fixed default map and renders it
 * read-only in Settings — rebinding lands in a future slice but the schema is
 * already keyed so the persisted shape stays stable.
 */
export type Shortcuts = Record<string, string>;

export interface AppSettings {
  appearance: AppearanceSettings;
  reader: ReaderDefaults;
  library: LibrarySettings;
  language: Language;
  shortcuts: Shortcuts;
}

/** Defaults written to the store on first boot and used as merge base. */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearance: { theme: 'sumi', fontSize: 'md', readingFont: 'fraunces' },
  reader: { mode: 'single', direction: 'rtl', fit: 'width', language: 'en' },
  library: { defaultChapterLanguage: 'en' },
  language: 'en',
  shortcuts: {},
};

/**
 * Recursive Partial — every nested object is also partial. Used by the
 * settings:set IPC payload so callers can patch a single nested field without
 * supplying the rest of the section.
 */
export type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
