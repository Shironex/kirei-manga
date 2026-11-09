import type { KeyBindings } from '@/lib/settings/contract';

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

/**
 * What a key is bound to. Most commands are an action; the four arrow
 * commands depend on where the reader is: left and right follow the reading
 * direction in the paged modes, down and up scroll a little in webtoon.
 */
export type ReaderCommand =
  | 'page-left'
  | 'page-right'
  | 'page-down'
  | 'page-up'
  | Exclude<ReaderAction, 'nudge-down' | 'nudge-up'>;

/** Every command with the keys it has out of the box. */
export type Bindings = Record<ReaderCommand, string[]>;

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

/**
 * The built-in bindings. Key names are `KeyboardEvent.key` values, `Space`
 * for the space bar and letters in lower case; named keys may carry `Shift+`.
 */
export const DEFAULT_BINDINGS: Readonly<Bindings> = Object.freeze({
  'page-left': ['ArrowLeft'],
  'page-right': ['ArrowRight'],
  'page-down': ['ArrowDown'],
  'page-up': ['ArrowUp'],
  next: ['Space', 'PageDown'],
  prev: ['Shift+Space', 'PageUp'],
  first: ['Home'],
  last: ['End'],
  'mode-single': ['1'],
  'mode-double': ['2'],
  'mode-webtoon': ['3'],
  'toggle-direction': ['d'],
  'toggle-shift': ['s'],
  'zoom-in': ['+', '='],
  'zoom-out': ['-'],
  'zoom-reset': ['0'],
  fullscreen: ['f'],
  'toggle-ui': ['h'],
  'toggle-panel': ['a'],
  'toggle-stats': ['i'],
  close: ['Escape'],
});

/** Commands in the order the Settings screen lists them, with their names. */
export const COMMANDS: ReadonlyArray<{ command: ReaderCommand; label: string }> = [
  { command: 'page-left', label: 'Turn the page to the left' },
  { command: 'page-right', label: 'Turn the page to the right' },
  { command: 'page-down', label: 'Next page, or scroll down in webtoon' },
  { command: 'page-up', label: 'Previous page, or scroll up in webtoon' },
  { command: 'next', label: 'Next page or screen' },
  { command: 'prev', label: 'Previous page or screen' },
  { command: 'first', label: 'First page' },
  { command: 'last', label: 'Last page' },
  { command: 'mode-single', label: 'Single page mode' },
  { command: 'mode-double', label: 'Double page mode' },
  { command: 'mode-webtoon', label: 'Webtoon mode' },
  { command: 'toggle-direction', label: 'Switch reading direction' },
  { command: 'toggle-shift', label: 'Shift spreads by one page' },
  { command: 'zoom-in', label: 'Zoom in' },
  { command: 'zoom-out', label: 'Zoom out' },
  { command: 'zoom-reset', label: 'Zoom to fit' },
  { command: 'fullscreen', label: 'Fullscreen' },
  { command: 'toggle-ui', label: 'Hide or show the controls' },
  { command: 'toggle-panel', label: 'Image and layout panel' },
  { command: 'toggle-stats', label: 'Performance overlay' },
  { command: 'close', label: 'Close the reader' },
];

/** Most keys one command takes, as `kirei_core::KeyBindings` allows. */
export const MAX_KEYS_PER_COMMAND = 4;

const COMMAND_NAMES = new Set<string>(COMMANDS.map(entry => entry.command));
/** Keys that only modify another, or that the browser keeps for itself. */
const UNBINDABLE = new Set([
  'Shift',
  'Control',
  'Alt',
  'Meta',
  'AltGraph',
  'CapsLock',
  'Fn',
  'Tab',
  'Dead',
  'Process',
  'Unidentified',
]);

/**
 * The binding name of a key press, or `null` when it cannot be bound: a
 * modifier on its own, Tab, or a shortcut with Cmd, Ctrl or Alt (those belong
 * to the app and the OS). A printed character already says whether Shift was
 * down (`F`, `+`), so it is matched without it and letters in lower case;
 * named keys keep Shift as a prefix (`Shift+Space`).
 */
export function comboOf(input: KeyInput): string | null {
  if (input.ctrlKey || input.metaKey || input.altKey) return null;
  const { key } = input;
  if (!key || UNBINDABLE.has(key)) return null;
  if (key === ' ') return input.shiftKey ? 'Shift+Space' : 'Space';
  if (key.length === 1) return key.toLowerCase();
  return input.shiftKey ? `Shift+${key}` : key;
}

function isCommand(name: string): name is ReaderCommand {
  return COMMAND_NAMES.has(name);
}

/**
 * The bindings in effect for what the settings store holds. A command the
 * store names takes exactly its stored keys; one it does not name (a command
 * added after the user last changed keys) keeps its built-in keys, minus any
 * the user has since given to another command.
 */
export function resolveBindings(stored: KeyBindings | null | undefined): Bindings {
  const resolved = Object.fromEntries(
    COMMANDS.map(({ command }) => [command, [] as string[]])
  ) as Bindings;
  const taken = new Set<string>();
  for (const [name, keys] of Object.entries(stored ?? {})) {
    if (!isCommand(name) || !Array.isArray(keys)) continue;
    for (const key of keys) {
      if (typeof key !== 'string' || !key || taken.has(key)) continue;
      taken.add(key);
      resolved[name].push(key);
    }
  }
  for (const { command } of COMMANDS) {
    if (stored && command in stored) continue;
    resolved[command] = DEFAULT_BINDINGS[command].filter(key => !taken.has(key));
    for (const key of resolved[command]) taken.add(key);
  }
  return resolved;
}

/**
 * What to store for `bindings`: nothing when they are the built-in ones, so a
 * later build's new defaults still reach this user, otherwise every command.
 */
export function storedBindings(bindings: Bindings): KeyBindings {
  const same = COMMANDS.every(({ command }) =>
    sameKeys(bindings[command], DEFAULT_BINDINGS[command])
  );
  return same ? {} : { ...bindings };
}

export function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** The command `combo` runs under `bindings`, if any. */
export function commandFor(bindings: Bindings, combo: string): ReaderCommand | null {
  for (const { command } of COMMANDS) {
    if (bindings[command].includes(combo)) return command;
  }
  return null;
}

/**
 * Binds `combo` to `command`. A key already on another command moves here
 * (the Settings screen asks first, using `commandFor`). A command already at
 * its limit drops its oldest key.
 */
export function bindKey(bindings: Bindings, command: ReaderCommand, combo: string): Bindings {
  const next = { ...bindings };
  for (const { command: other } of COMMANDS) {
    if (other !== command && next[other].includes(combo))
      next[other] = next[other].filter(key => key !== combo);
  }
  if (!next[command].includes(combo))
    next[command] = [...next[command], combo].slice(-MAX_KEYS_PER_COMMAND);
  return next;
}

export function unbindKey(bindings: Bindings, command: ReaderCommand, combo: string): Bindings {
  return { ...bindings, [command]: bindings[command].filter(key => key !== combo) };
}

/**
 * Puts `command` back on its built-in keys. A built-in key another command
 * holds now stays there, so resetting never creates a conflict.
 */
export function resetCommand(bindings: Bindings, command: ReaderCommand): Bindings {
  const elsewhere = new Set(
    COMMANDS.filter(entry => entry.command !== command).flatMap(entry => bindings[entry.command])
  );
  return { ...bindings, [command]: DEFAULT_BINDINGS[command].filter(key => !elsewhere.has(key)) };
}

function actionOf(command: ReaderCommand, context: KeyContext): ReaderAction {
  const webtoon = context.mode === 'webtoon';
  const rtl = context.direction === 'rtl' && !webtoon;
  switch (command) {
    case 'page-left':
      return rtl ? 'next' : 'prev';
    case 'page-right':
      return rtl ? 'prev' : 'next';
    case 'page-down':
      return webtoon ? 'nudge-down' : 'next';
    case 'page-up':
      return webtoon ? 'nudge-up' : 'prev';
    default:
      return command;
  }
}

/**
 * Maps a key press to a reader action, or `null` to let it through. With the
 * built-in bindings, arrows follow the reading direction in the paged modes:
 * in right to left the left arrow goes forward, like turning a page of a
 * printed manga. In webtoon the vertical arrows scroll a little and the
 * horizontal ones a whole screen.
 */
export function keyAction(
  input: KeyInput,
  context: KeyContext,
  bindings: Bindings = DEFAULT_BINDINGS
): ReaderAction | null {
  const combo = comboOf(input);
  if (combo === null) return null;
  const command = commandFor(bindings, combo);
  return command === null ? null : actionOf(command, context);
}

const KEY_LABELS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  Escape: 'Esc',
  PageUp: 'Page Up',
  PageDown: 'Page Down',
  Backspace: 'Backspace',
  Enter: 'Enter',
};

/** How a binding is shown on a key cap: `←`, `Shift Space`, `F`. */
export function keyLabel(combo: string): string {
  const shifted = combo.startsWith('Shift+') && combo.length > 'Shift+'.length;
  const key = shifted ? combo.slice('Shift+'.length) : combo;
  const label = KEY_LABELS[key] ?? (key.length === 1 ? key.toUpperCase() : key);
  return shifted ? `Shift ${label}` : label;
}

/** The first key of `command` as a key cap label, for tooltips. */
export function firstKeyLabel(bindings: Bindings, command: ReaderCommand): string | undefined {
  const first = bindings[command][0];
  return first === undefined ? undefined : keyLabel(first);
}
