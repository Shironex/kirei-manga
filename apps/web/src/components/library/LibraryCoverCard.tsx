import type { Series } from '@kireimanga/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';

interface Props {
  series: Series;
  className?: string;
  sizeHint?: 'default' | 'tall';
}

/**
 * Library variant of the Browse CoverCard. Shares visual structure with
 * components/browse/CoverCard.tsx — no contentRating badge, no author line.
 */
export function LibraryCoverCard({ series, className, sizeHint = 'default' }: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <Link
      to={`/series/${series.mangadexId}`}
      aria-label={series.title}
      className={[
        'group relative flex flex-col focus:outline-none',
        sizeHint === 'tall' ? 'row-span-2' : '',
        className ?? '',
      ].join(' ')}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[2px] bg-[var(--color-ink-sunken)]">
        {series.coverPath ? (
          <img
            src={series.coverPath}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className={[
              'h-full w-full object-cover transition-opacity duration-500 ease-[var(--ease-out-quart)]',
              loaded ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-kanji text-[48px] leading-none text-[var(--color-bone-faint)] opacity-50">
              綺
            </span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <h3 className="font-display text-[14px] leading-snug font-[380] tracking-[-0.01em] text-foreground italic transition-[font-style,color] group-hover:not-italic group-hover:text-foreground">
          {series.title}
        </h3>
      </div>
    </Link>
  );
}
