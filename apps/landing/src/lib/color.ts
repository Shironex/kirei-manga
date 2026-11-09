/** OKLCH to an sRGB hex string, for three.js and canvas colours. */
export function oklchToHex(l: number, c: number, h: number): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;

  const linear = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];

  return (
    '#' +
    linear
      .map(v => {
        const x = Math.min(1, Math.max(0, v));
        const srgb = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
        return Math.round(srgb * 255)
          .toString(16)
          .padStart(2, '0');
      })
      .join('')
  );
}

/**
 * The seed hue is kept unwrapped, so the registered property transition
 * takes the short way round: from 350 to 10 it goes to 370, not back to 10.
 */
export function nearestHue(current: number, target: number): number {
  const delta = ((((target - current) % 360) + 540) % 360) - 180;
  return current + delta;
}
