import { useEffect, useState, type CSSProperties } from 'react';

import { cn } from '@/lib/utils';

/**
 * One page bitmap. A new `src` for the same page (a new render revision after
 * a resize, a zoom or a filter change) is decoded off screen first and swapped
 * in when ready, so the page never blanks. A different page gets a new key in
 * the parent and mounts fresh.
 */
export function PageImage({
  src,
  alt,
  className,
  style,
  onLoad,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** Natural size of the bitmap, once it has loaded. */
  onLoad?: (width: number, height: number) => void;
}) {
  const [shown, setShown] = useState(src);

  useEffect(() => {
    if (src === shown) return;
    let alive = true;
    const next = new Image();
    next.src = src;
    const swap = () => {
      if (alive) setShown(src);
    };
    // A failed decode still swaps, so the error shows instead of a stale page.
    next.decode().then(swap, swap);
    return () => {
      alive = false;
    };
  }, [src, shown]);

  return (
    <img
      src={shown}
      alt={alt}
      draggable={false}
      decoding="async"
      className={cn('block select-none', className)}
      style={style}
      onLoad={event =>
        onLoad?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
      }
    />
  );
}
