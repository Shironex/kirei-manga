import { useEffect, useRef, useState } from 'react';
import type { BoundingBox, PageTranslation } from '@kireimanga/shared';
import { FittedText } from './FittedText';

interface TranslationOverlayProps {
  /** Bubbles to render — usually the value from `useTranslationForPage`. */
  page: PageTranslation;
  /** Natural pixel width of the source page image. */
  imageNaturalWidth: number;
  /** Natural pixel height of the source page image. */
  imageNaturalHeight: number;
  /**
   * The rendered <img>. When supplied, the overlay observes its layout
   * box and rescales bubble coordinates as zoom / fit changes — without
   * it the overlay falls back to a 1:1 scale (suitable for tests).
   */
  imageElement?: HTMLImageElement | null;
  /** Bubble background opacity, `0`–`1` (default `1`). */
  opacity?: number;
  /** CSS font-family applied to bubble text (default `var(--font-fraunces)`). */
  font?: string;
}

interface BubbleBoxProps {
  box: BoundingBox;
  translated: string;
  original: string;
  scale: number;
  opacity: number;
  font: string;
}

const DEFAULT_FONT = 'var(--font-fraunces)';

/**
 * Absolutely-positioned overlay layer that paints translated text on top of
 * a manga page image. Each bubble is anchored to its detector-reported
 * bounding box (in source pixel space) and the whole layer rescales when
 * the underlying image is zoomed or refit.
 */
export function TranslationOverlay({
  page,
  imageNaturalWidth,
  imageNaturalHeight: _imageNaturalHeight,
  imageElement,
  opacity = 1,
  font = DEFAULT_FONT,
}: TranslationOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!imageElement) {
      setScale(1);
      return;
    }
    if (imageNaturalWidth <= 0) {
      setScale(1);
      return;
    }

    const update = (): void => {
      const renderedWidth = imageElement.getBoundingClientRect().width;
      if (renderedWidth <= 0) return;
      setScale(renderedWidth / imageNaturalWidth);
    };

    update();

    const observer = new ResizeObserver(update);
    observer.observe(imageElement);
    return () => observer.disconnect();
  }, [imageElement, imageNaturalWidth]);

  if (page.bubbles.length === 0) return null;

  return (
    <div
      ref={containerRef}
      data-testid="translation-overlay"
      className="translation-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        // Bubble click-through; individual BubbleBoxes re-enable pointer
        // events so G.4's popover can attach to them without the wrapper
        // blocking page-image gestures (zoom-on-wheel, drag, etc).
        pointerEvents: 'none',
      }}
    >
      {page.bubbles.map((b, i) => (
        <BubbleBox
          key={`${page.pageHash}-${i}`}
          box={b.box}
          translated={b.translated}
          original={b.original}
          scale={scale}
          opacity={opacity}
          font={font}
        />
      ))}
    </div>
  );
}

/**
 * A single translated bubble. Painted in the kinari/sumi palette so the
 * layer reads as ink-on-paper rather than a generic white rectangle.
 */
function BubbleBox({ box, translated, scale, opacity, font }: BubbleBoxProps) {
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const padding = Math.max(2, 4 * scale);
  return (
    <div
      data-testid="translation-bubble"
      className="translation-bubble"
      style={{
        position: 'absolute',
        left: `${box.x * scale}px`,
        top: `${box.y * scale}px`,
        width: `${box.w * scale}px`,
        height: `${box.h * scale}px`,
        // Kinari paper-white background with configurable opacity. Using
        // color-mix matches the rest of the design system (oklch tokens),
        // which sidesteps inventing an `rgb(a b c / x)` fallback.
        backgroundColor: `color-mix(in oklch, var(--color-bone) ${clampedOpacity * 100}%, transparent)`,
        color: 'var(--color-ink)',
        borderRadius: 'var(--radius-sm)',
        // Re-enable pointer events so G.4's per-bubble popover handler
        // (added in a later phase) can hit-test against each box.
        pointerEvents: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${padding}px`,
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      <FittedText text={translated} font={font} />
    </div>
  );
}
