import { describe, expect, it } from 'vitest';

import {
  adjustmentsFromSettings,
  cssFilter,
  defaultAdjustments,
  isNeutral,
  parseAdjustments,
} from './adjust';

type Rgb = [number, number, number];

/**
 * The Filter Effects matrices for the functions `cssFilter` emits, applied to
 * one colour in 0..1, to check what a filter string does to real pixels.
 */
function apply(filter: string, color: Rgb): Rgb {
  let [r, g, b] = color;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  for (const [, name, raw] of filter.matchAll(/([a-z-]+)\(([^)]+)\)/g)) {
    const amount = parseFloat(raw ?? '0');
    switch (name) {
      case 'invert':
        [r, g, b] = [r, g, b].map(v => amount * (1 - v) + (1 - amount) * v) as Rgb;
        break;
      case 'hue-rotate': {
        const a = (amount * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const m = [
          [
            0.213 + c * 0.787 - s * 0.213,
            0.715 - c * 0.715 - s * 0.715,
            0.072 - c * 0.072 + s * 0.928,
          ],
          [
            0.213 - c * 0.213 + s * 0.143,
            0.715 + c * 0.285 + s * 0.14,
            0.072 - c * 0.072 - s * 0.283,
          ],
          [
            0.213 - c * 0.213 - s * 0.787,
            0.715 - c * 0.715 + s * 0.715,
            0.072 + c * 0.928 + s * 0.072,
          ],
        ];
        [r, g, b] = m.map(row => clamp(row[0]! * r + row[1]! * g + row[2]! * b)) as Rgb;
        break;
      }
      case 'grayscale': {
        const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        [r, g, b] = [y, y, y];
        break;
      }
      case 'sepia': {
        const sr = 0.393 * r + 0.769 * g + 0.189 * b;
        const sg = 0.349 * r + 0.686 * g + 0.168 * b;
        const sb = 0.272 * r + 0.534 * g + 0.131 * b;
        [r, g, b] = [
          clamp(r + (sr - r) * amount),
          clamp(g + (sg - g) * amount),
          clamp(b + (sb - b) * amount),
        ];
        break;
      }
      case 'brightness':
        [r, g, b] = [r, g, b].map(v => clamp(v * amount)) as Rgb;
        break;
      case 'contrast':
        [r, g, b] = [r, g, b].map(v => clamp((v - 0.5) * amount + 0.5)) as Rgb;
        break;
    }
  }
  return [r, g, b];
}

const WHITE: Rgb = [1, 1, 1];
const BLACK: Rgb = [0, 0, 0];

function expectColor(actual: Rgb, expected: Rgb) {
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i] ?? 0, 3));
}

describe('cssFilter', () => {
  it('is none when neutral', () => {
    expect(cssFilter(defaultAdjustments())).toBe('none');
  });

  it('lists only the adjustments that changed, invert first', () => {
    const filter = cssFilter({
      ...defaultAdjustments(),
      invert: true,
      warmth: 30,
      brightness: 80,
      contrast: 120,
    });
    expect(filter).toBe('invert(1) hue-rotate(180deg) sepia(0.3) brightness(0.8) contrast(1.2)');
  });

  it('grayscale wins over saturation', () => {
    expect(cssFilter({ ...defaultAdjustments(), saturation: 150, grayscale: true })).toBe(
      'grayscale(1)'
    );
    expect(cssFilter({ ...defaultAdjustments(), saturation: 150 })).toBe('saturate(1.5)');
  });

  it('night mode turns paper dark and ink light', () => {
    const night = cssFilter({ ...defaultAdjustments(), invert: true });
    expectColor(apply(night, WHITE), BLACK);
    expectColor(apply(night, BLACK), WHITE);
  });

  it('night mode keeps a red reddish', () => {
    const [r, g, b] = apply(cssFilter({ ...defaultAdjustments(), invert: true }), [0.8, 0.1, 0.1]);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('dimming an inverted page dims its light lines', () => {
    const filter = cssFilter({ ...defaultAdjustments(), invert: true, brightness: 50 });
    expectColor(apply(filter, BLACK), [0.5, 0.5, 0.5]);
    expectColor(apply(filter, WHITE), BLACK);
  });

  it('warmth tints paper toward amber and keeps white from going blue', () => {
    const warm = cssFilter({ ...defaultAdjustments(), warmth: 100 });
    const [r, g, b] = apply(warm, [0.8, 0.8, 0.8]);
    expect(r).toBe(1);
    expect(g).toBeLessThan(r);
    expect(b).toBeLessThan(g);
    const [, , white] = apply(warm, WHITE);
    expect(white).toBeLessThan(1);
  });
});

describe('parseAdjustments', () => {
  const fallback = defaultAdjustments('mitchell');

  it('keeps the fallback for anything missing or invalid', () => {
    expect(parseAdjustments(undefined, fallback)).toEqual(fallback);
    expect(parseAdjustments({ brightness: 'bright', resample: 'bicubic' }, fallback)).toEqual(
      fallback
    );
  });

  it('clamps and rounds numbers into their ranges', () => {
    const parsed = parseAdjustments(
      { brightness: 400, contrast: 10, sharpen: 33.6, saturation: -5 },
      fallback
    );
    expect(parsed).toMatchObject({ brightness: 150, contrast: 50, sharpen: 34, saturation: 0 });
  });

  it('reads every field', () => {
    const stored = {
      brightness: 90,
      contrast: 110,
      saturation: 80,
      sharpen: 40,
      warmth: 20,
      invert: true,
      grayscale: true,
      resample: 'nearest',
    };
    expect(parseAdjustments(stored, fallback)).toEqual(stored);
  });
});

describe('adjustmentsFromSettings', () => {
  const fallback = defaultAdjustments();

  it('remembers by default when nothing is saved', () => {
    expect(adjustmentsFromSettings(null, fallback)).toEqual({
      adjustments: fallback,
      remember: true,
    });
    expect(adjustmentsFromSettings({ reader: {} }, fallback).remember).toBe(true);
  });

  it('a null entry means the reader chose not to remember', () => {
    expect(adjustmentsFromSettings({ adjust: null }, fallback)).toEqual({
      adjustments: fallback,
      remember: false,
    });
  });

  it('reads saved adjustments', () => {
    const { adjustments, remember } = adjustmentsFromSettings(
      { adjust: { brightness: 80 } },
      fallback
    );
    expect(remember).toBe(true);
    expect(adjustments.brightness).toBe(80);
  });
});

describe('isNeutral', () => {
  it('compares against the defaults, resample included', () => {
    const defaults = defaultAdjustments('mitchell');
    expect(isNeutral(defaults, defaults)).toBe(true);
    expect(isNeutral({ ...defaults, resample: 'lanczos3' }, defaults)).toBe(false);
    expect(isNeutral({ ...defaults, sharpen: 10 }, defaults)).toBe(false);
  });
});
