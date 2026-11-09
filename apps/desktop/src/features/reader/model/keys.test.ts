import { describe, expect, it } from 'vitest';

import {
  bindKey,
  comboOf,
  commandFor,
  DEFAULT_BINDINGS,
  keyAction,
  keyLabel,
  resetCommand,
  resolveBindings,
  storedBindings,
  unbindKey,
  type KeyContext,
  type KeyInput,
} from './keys';

const press = (key: string, extra: Partial<KeyInput> = {}): KeyInput => ({
  key,
  shiftKey: false,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...extra,
});

const ltr: KeyContext = { mode: 'single', direction: 'ltr' };
const rtl: KeyContext = { mode: 'double', direction: 'rtl' };
const webtoon: KeyContext = { mode: 'webtoon', direction: 'rtl' };

describe('keyAction', () => {
  it('turns pages with the arrows in reading direction', () => {
    expect(keyAction(press('ArrowRight'), ltr)).toBe('next');
    expect(keyAction(press('ArrowLeft'), ltr)).toBe('prev');
    expect(keyAction(press('ArrowLeft'), rtl)).toBe('next');
    expect(keyAction(press('ArrowRight'), rtl)).toBe('prev');
  });

  it('goes forward with down, space and page down in every direction', () => {
    for (const context of [ltr, rtl]) {
      expect(keyAction(press('ArrowDown'), context)).toBe('next');
      expect(keyAction(press(' '), context)).toBe('next');
      expect(keyAction(press('PageDown'), context)).toBe('next');
      expect(keyAction(press('ArrowUp'), context)).toBe('prev');
      expect(keyAction(press(' ', { shiftKey: true }), context)).toBe('prev');
      expect(keyAction(press('PageUp'), context)).toBe('prev');
    }
  });

  it('scrolls a little with the vertical arrows in webtoon and ignores the direction', () => {
    expect(keyAction(press('ArrowDown'), webtoon)).toBe('nudge-down');
    expect(keyAction(press('ArrowUp'), webtoon)).toBe('nudge-up');
    expect(keyAction(press('ArrowRight'), webtoon)).toBe('next');
    expect(keyAction(press('ArrowLeft'), webtoon)).toBe('prev');
  });

  it('jumps to the ends with Home and End', () => {
    expect(keyAction(press('Home'), ltr)).toBe('first');
    expect(keyAction(press('End'), rtl)).toBe('last');
  });

  it('maps letters in either case and the mode digits', () => {
    expect(keyAction(press('f'), ltr)).toBe('fullscreen');
    expect(keyAction(press('F', { shiftKey: true }), ltr)).toBe('fullscreen');
    expect(keyAction(press('1'), ltr)).toBe('mode-single');
    expect(keyAction(press('2'), ltr)).toBe('mode-double');
    expect(keyAction(press('3'), ltr)).toBe('mode-webtoon');
    expect(keyAction(press('Escape'), ltr)).toBe('close');
    expect(keyAction(press('+', { shiftKey: true }), ltr)).toBe('zoom-in');
  });

  it('leaves shortcuts with a modifier and unknown keys alone', () => {
    expect(keyAction(press('ArrowRight', { metaKey: true }), ltr)).toBeNull();
    expect(keyAction(press('1', { ctrlKey: true }), ltr)).toBeNull();
    expect(keyAction(press('f', { altKey: true }), ltr)).toBeNull();
    expect(keyAction(press('q'), ltr)).toBeNull();
    expect(keyAction(press('Tab'), ltr)).toBeNull();
  });
});

describe('comboOf', () => {
  it('names keys the way bindings store them', () => {
    expect(comboOf(press(' '))).toBe('Space');
    expect(comboOf(press(' ', { shiftKey: true }))).toBe('Shift+Space');
    expect(comboOf(press('J', { shiftKey: true }))).toBe('j');
    expect(comboOf(press('ArrowLeft', { shiftKey: true }))).toBe('Shift+ArrowLeft');
    expect(comboOf(press('PageDown'))).toBe('PageDown');
  });

  it('refuses modifiers, Tab and shortcuts with Cmd, Ctrl or Alt', () => {
    expect(comboOf(press('Shift', { shiftKey: true }))).toBeNull();
    expect(comboOf(press('Tab'))).toBeNull();
    expect(comboOf(press('j', { metaKey: true }))).toBeNull();
    expect(comboOf(press('j', { altKey: true }))).toBeNull();
  });
});

describe('custom bindings', () => {
  it('runs a remapped key and frees the old one', () => {
    const bindings = resolveBindings({ ...DEFAULT_BINDINGS, next: ['j'], prev: ['k'] });
    expect(keyAction(press('j'), ltr, bindings)).toBe('next');
    expect(keyAction(press('K', { shiftKey: true }), ltr, bindings)).toBe('prev');
    expect(keyAction(press(' '), ltr, bindings)).toBeNull();
  });

  it('keeps the direction rules on remapped arrow commands', () => {
    const bindings = resolveBindings({ ...DEFAULT_BINDINGS, 'page-left': ['q'] });
    expect(keyAction(press('q'), rtl, bindings)).toBe('next');
    expect(keyAction(press('q'), ltr, bindings)).toBe('prev');
  });

  it('gives commands the store does not name their defaults, minus taken keys', () => {
    const bindings = resolveBindings({ next: ['f'] });
    expect(bindings.next).toEqual(['f']);
    expect(bindings.fullscreen).toEqual([]);
    expect(bindings.first).toEqual(['Home']);
  });

  it('ignores unknown commands, junk and keys stored twice', () => {
    const bindings = resolveBindings({
      sparkle: ['x'],
      next: ['j', 'j'],
      prev: ['j', 'k'],
    } as Record<string, string[]>);
    expect(bindings.next).toEqual(['j']);
    expect(bindings.prev).toEqual(['k']);
    expect(commandFor(bindings, 'x')).toBeNull();
  });

  it('stores nothing for the built-in bindings and everything otherwise', () => {
    expect(storedBindings(resolveBindings({}))).toEqual({});
    const changed = bindKey(resolveBindings({}), 'next', 'j');
    expect(storedBindings(changed).next).toEqual(['Space', 'PageDown', 'j']);
    expect(Object.keys(storedBindings(changed))).toHaveLength(Object.keys(DEFAULT_BINDINGS).length);
  });
});

describe('editing bindings', () => {
  it('finds the command a key belongs to, for the conflict check', () => {
    const bindings = resolveBindings({});
    expect(commandFor(bindings, 'f')).toBe('fullscreen');
    expect(commandFor(bindings, 'Shift+Space')).toBe('prev');
    expect(commandFor(bindings, 'j')).toBeNull();
  });

  it('moves a key that another command had, so no key runs two commands', () => {
    const bindings = bindKey(resolveBindings({}), 'next', 'f');
    expect(bindings.next).toContain('f');
    expect(bindings.fullscreen).toEqual([]);
    const all = Object.values(bindings).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('caps a command at four keys, dropping the oldest', () => {
    let bindings = resolveBindings({});
    for (const key of ['j', 'n', 'Enter']) bindings = bindKey(bindings, 'next', key);
    expect(bindings.next).toEqual(['PageDown', 'j', 'n', 'Enter']);
  });

  it('removes one key and resets a command without taking keys back', () => {
    let bindings = unbindKey(resolveBindings({}), 'zoom-in', '=');
    expect(bindings['zoom-in']).toEqual(['+']);
    bindings = bindKey(bindings, 'zoom-out', '=');
    bindings = resetCommand(bindings, 'zoom-in');
    expect(bindings['zoom-in']).toEqual(['+']);
    expect(bindings['zoom-out']).toEqual(['-', '=']);
  });

  it('labels keys for key caps', () => {
    expect(keyLabel('ArrowLeft')).toBe('←');
    expect(keyLabel('Shift+Space')).toBe('Shift Space');
    expect(keyLabel('f')).toBe('F');
    expect(keyLabel('Escape')).toBe('Esc');
    expect(keyLabel('+')).toBe('+');
  });
});
