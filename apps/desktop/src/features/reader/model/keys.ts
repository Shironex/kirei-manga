import type { Direction, ReaderMode } from './prefs';

/** What a key asks the reader to do. */
export type ReaderAction =
  | 'next'
  | 'prev'
  | 'first'
  | 'last'
  | 'nudge-down'
  | 'nudge-up'
  | 'toggle-ui'
  | 'fullscreen'
  | 'mode-single'
  | 'mode-double'
  | 'mode-webtoon'
  | 'toggle-direction'
  | 'toggle-shift'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'toggle-panel'
  | 'toggle-stats'
  | 'close';

export interface KeyInput {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

export interface KeyContext {
  mode: ReaderMode;
  direction: Direction;
}

/** Keys that work the same in every mode. Letters are matched lower case. */
const COMMON: Record<string, ReaderAction> = {
  Home: 'first',
  End: 'last',
  PageDown: 'next',
  PageUp: 'prev',
  f: 'fullscreen',
  h: 'toggle-ui',
  '1': 'mode-single',
  '2': 'mode-double',
  '3': 'mode-webtoon',
  d: 'toggle-direction',
  s: 'toggle-shift',
  a: 'toggle-panel',
  i: 'toggle-stats',
  '+': 'zoom-in',
  '=': 'zoom-in',
  '-': 'zoom-out',
  '0': 'zoom-reset',
  Escape: 'close',
};

/**
 * Maps a key press to a reader action, or `null` to let it through. Arrows
 * follow the reading direction in the paged modes: in right to left, the left
 * arrow goes forward, like turning a page of a printed manga. In webtoon the
 * vertical arrows scroll a little and the horizontal ones a whole screen.
 * Shortcuts with a modifier (Cmd, Ctrl, Alt) belong to the app and the OS.
 */
export function keyAction(input: KeyInput, context: KeyContext): ReaderAction | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  const { key } = input;
  const webtoon = context.mode === 'webtoon';
  const rtl = context.direction === 'rtl' && !webtoon;

  switch (key) {
    case 'ArrowRight':
      return rtl ? 'prev' : 'next';
    case 'ArrowLeft':
      return rtl ? 'next' : 'prev';
    case 'ArrowDown':
      return webtoon ? 'nudge-down' : 'next';
    case 'ArrowUp':
      return webtoon ? 'nudge-up' : 'prev';
    case ' ':
      return input.shiftKey ? 'prev' : 'next';
  }
  return COMMON[key.length === 1 ? key.toLowerCase() : key] ?? null;
}

/** Labels for the shortcut sheet and tooltips. */
export const SHORTCUTS: ReadonlyArray<readonly [keys: string, what: string]> = [
  ['Arrows, Space, Page Up/Down', 'Turn the page'],
  ['Home, End', 'First or last page'],
  ['1, 2, 3', 'Single, double, webtoon'],
  ['D', 'Reading direction'],
  ['S', 'Shift spreads by one page'],
  ['+, -, 0', 'Zoom in, out, fit'],
  ['F', 'Fullscreen'],
  ['H', 'Hide or show the controls'],
  ['A', 'Image panel'],
  ['Esc', 'Close the reader'],
];
