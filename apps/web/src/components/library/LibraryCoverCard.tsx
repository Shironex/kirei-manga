import type { Series } from '@kireimanga/shared';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '@/hooks/useT';

interface Props {
  series: Series;
  className?: string;
  sizeHint?: 'default' | 'tall';
}

/**
 * Route target for a library card. MangaDex uses the mangadex UUID;
 * local-source series route to a placeholder under `/series/local/:id`
 * that Slice G replaces with the real series-detail layout.
 */
function cardHref(series: Series): string {
  if (series.source === 'local') return `/series/local/${series.id}`;
  return `/series/${series.mangadexId}`;
}

/**
 * Library variant of the Browse CoverCard. Shares visual structure with
 * components/browse/CoverCard.tsx — no contentRating badge, no author line.
 */
export function LibraryCoverCard({ series, className, sizeHint = 'default' }: Props) {
  const [loaded, setLoaded] = useState(false);
  const t = useT();

  return (
    <Link
      to={cardHref(series)}
      aria-label={series.title}
      className={[
        'group relative flex flex-col focus:outline-none',
        sizeHint === 'tall' ? 'row-span-2' : '',
        className ?? '',
      ].join(' ')}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[2px] bg-[var(--color-ink-sunken)]">
        {series.source === 'local' && (
          <span
            className="absolute top-1.5 left-1.5 z-10 rounded-[2px] border border-[var(--color-rule-strong)] bg-[var(--color-ink)]/80 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase backdrop-blur-sm"
            aria-label={t('library.card.localBadge')}
          >
            {t('library.card.localBadge')}
          </span>
        )}
        {series.newChapterCount != null && series.newChapterCount > 0 && (
          <span className="absolute -top-1 -right-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-mono font-medium text-[var(--color-accent-foreground)]">
            {series.newChapterCount}
          </span>
        )}
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
