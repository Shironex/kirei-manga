import { useEffect, useState } from 'react';

import { coverUrl } from '@/lib/library';
import { useSetting } from '@/lib/settings/store';
import { AMBIENT_COVER, AMBIENT_SCRIM } from '@/lib/theme/ambient';
import { useCoverFocus } from '@/lib/theme/coverTheme';
import { cn } from '@/lib/utils';

/**
 * Cover glow behind the top of every page: the seed's ambient colour as soft
 * light, and over it the cover in focus, blurred and dimmed (see ambient.ts
 * for the ceiling that keeps text over it at AA). Two image slots crossfade
 * on the theme duration, so a new cover dissolves in while the colours move.
 * Hidden with data-ambient="off"; the cover layer also goes when cover
 * colours are off.
 */
export function Ambient({ tall = false }: { tall?: boolean }) {
  const focus = useCoverFocus();
  const [coverColours] = useSetting('appearance.coverColours');
  const src = coverColours && focus?.hash ? coverUrl({ hash: focus.hash }) : null;
  const [slots, setSlots] = useState<{ urls: [string | null, string | null]; front: 0 | 1 }>({
    urls: [src, null],
    front: 0,
  });

  useEffect(() => {
    setSlots(prev => {
      if (prev.urls[prev.front] === src) return prev;
      const back = prev.front === 0 ? 1 : 0;
      const urls: [string | null, string | null] = [...prev.urls];
      urls[back] = src;
      return { urls, front: back };
    });
  }, [src]);

  const opacity = tall ? AMBIENT_COVER.opacity.series : AMBIENT_COVER.opacity.page;

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden transition-[height] duration-slow ease-expo [:root[data-ambient=off]_&]:hidden',
        tall ? 'h-[980px]' : 'h-[760px]'
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(75%_85%_at_70%_-5%,var(--ambient),transparent_72%),radial-gradient(55%_65%_at_15%_-15%,oklch(0.42_var(--accent-c)_calc(var(--seed-h)-28)/calc(0.38*var(--strength))),transparent_70%),radial-gradient(35%_40%_at_92%_30%,oklch(0.5_calc(var(--accent-c)*0.8)_calc(var(--seed-h)+70)/calc(0.16*var(--strength))),transparent_70%)] transition-[background] duration-theme ease-theme" />
      {slots.urls.map((url, i) =>
        url ? (
          <img
            key={i}
            src={url}
            alt=""
            draggable={false}
            className="absolute -top-[30%] -left-[10%] h-[130%] w-[120%] max-w-none object-cover transition-opacity duration-theme ease-theme"
            style={{
              filter: `blur(80px) saturate(1.4) brightness(${AMBIENT_COVER.brightness})`,
              opacity: slots.front === i ? `min(1, calc(${opacity} * var(--strength)))` : 0,
            }}
          />
        ) : null
      )}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(180deg, ${AMBIENT_SCRIM} 0%, var(--ink-0) 92%)` }}
      />
    </div>
  );
}
