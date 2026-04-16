/**
 * Reader layout mode.
 * - single: one page at a time, keyboard-paginated.
 * - double: two pages side-by-side (page 0 alone as cover, then 1+2, 3+4, ...).
 * - webtoon: vertical scroll, pages stacked with no gap.
 */
export type ReaderMode = 'single' | 'double' | 'webtoon';

/** Page-turn direction for single/double modes. Webtoon ignores this. */
export type ReaderDirection = 'rtl' | 'ltr';

/** How the page image fills the viewport. */
export type FitMode = 'width' | 'height' | 'original';

/** Full reader settings tuple persisted per series. */
export interface ReaderSettings {
  mode: ReaderMode;
  direction: ReaderDirection;
  fit: FitMode;
}

/** Defaults used when a series has never had reader prefs written. */
export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  mode: 'single',
  direction: 'rtl',
  fit: 'width',
};
