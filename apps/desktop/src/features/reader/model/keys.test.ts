import { describe, expect, it } from 'vitest';

import { keyAction, type KeyContext, type KeyInput } from './keys';

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
