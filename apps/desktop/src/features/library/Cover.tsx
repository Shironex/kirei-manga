import { useState, type ReactNode } from 'react';
import { BookImage } from 'lucide-react';

import { coverUrl, type CoverRef } from '@/lib/library';
import { cn } from '@/lib/utils';

/**
 * A series cover at 2:3, loaded by hash over the kirei-cover scheme. Fades in
 * once decoded so a scrolled-in tile never flashes a half drawn image. A series
 * with no cover (or a thumbnail that fails) gets a quiet placeholder with its
 * title, tinted by the theme seed rather than an empty box.
 */
export function Cover({
  cover,
  title,
  className,
  eager = false,
  children,
}: {
  cover: CoverRef | null;
  title: string;
  className?: string;
  /** Above-the-fold covers (hero, series page) load at once. */
  eager?: boolean;
  /** Overlays such as the new chapter badge. */
  children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const src = cover && !failed ? coverUrl(cover) : null;

  return (
    <span
      className={cn(
        'relative block aspect-[2/3] overflow-hidden rounded-cover bg-ink-2',
        'shadow-[inset_0_1px_0_oklch(1_0_0/0.06),0_18px_40px_-18px_oklch(0.02_0.02_var(--seed-h)/0.9)]',
        className
      )}
    >
      {src ? (
        <img
          src={src}
          alt=""
          draggable={false}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn(
            'block size-full object-cover transition-opacity duration-slow ease-expo select-none',
            loaded ? 'opacity-100' : 'opacity-0'
          )}
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 flex flex-col justify-between bg-[linear-gradient(160deg,oklch(0.3_calc(var(--accent-c)*0.6)_var(--seed-h)),var(--ink-1))] p-[9%]"
        >
          <BookImage className="size-[18%] min-w-4 text-fg-3" />
          <span className="line-clamp-4 font-display text-[clamp(12px,1.1em,22px)] leading-tight font-bold text-fg-2 font-condensed">
            {title}
          </span>
        </span>
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(100deg,oklch(1_0_0/0.08),transparent_30%)] shadow-[inset_0_0_0_1px_oklch(1_0_0/0.07)]"
      />
      {children}
    </span>
  );
}
