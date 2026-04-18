import { useLayoutEffect, useRef, useState } from 'react';

interface FittedTextProps {
  text: string;
  font: string;
  /** Smallest font-size (px) the search will accept. */
  minSize?: number;
  /** Largest font-size (px) the search will try. */
  maxSize?: number;
}

/**
 * Renders `text` and binary-searches the largest integer pixel font-size
 * whose rendered width and height fit the parent element. Re-runs when
 * `text`, `font`, or the parent's bounds change.
 */
export function FittedText({ text, font, minSize = 6, maxSize = 48 }: FittedTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fontSize, setFontSize] = useState(maxSize);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    const fit = (): void => {
      const parentWidth = parent.clientWidth;
      const parentHeight = parent.clientHeight;
      // Zero-sized container — nothing to fit, leave the previous size in
      // place so we don't flash to `minSize` during a transient layout pass
      // (e.g. ResizeObserver firing before the image lays out).
      if (parentWidth <= 0 || parentHeight <= 0) return;

      let lo = minSize;
      let hi = maxSize;
      let best = minSize;
      while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        el.style.fontSize = `${mid}px`;
        if (el.scrollWidth <= parentWidth && el.scrollHeight <= parentHeight) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      el.style.fontSize = `${best}px`;
      setFontSize(best);
    };

    fit();

    // Re-fit when the bubble box is resized by the page image scaling
    // (zoom / fit-mode changes propagate down through the overlay's
    // ResizeObserver into the parent's clientWidth/Height).
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [text, font, minSize, maxSize]);

  return (
    <span
      ref={ref}
      style={{
        fontFamily: font,
        fontSize,
        lineHeight: 1.15,
        textAlign: 'center',
        wordBreak: 'break-word',
        display: 'block',
      }}
    >
      {text}
    </span>
  );
}
