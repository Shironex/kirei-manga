import type { SearchResult } from '@kireimanga/shared';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useT } from '@/hooks/useT';
import { useLibraryStore } from '@/stores/library-store';

interface Props {
  result: SearchResult;
  className?: string;
}

export function CoverCard({ result, className }: Props) {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const isSafe = result.contentRating === 'safe';
  const inLibrary = useLibraryStore(s => Boolean(s.mangadexIndex[result.id]));

  return (
    <Link
      to={`/series/${result.id}`}
      aria-label={result.title}
      className={['group relative flex flex-col focus:outline-none', className ?? ''].join(' ')}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-[2px] bg-[var(--color-ink-sunken)]">
        {!isSafe && (
          <span className="absolute top-2 left-2 z-10 rounded-[2px] bg-black/55 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] text-[var(--color-bone)] uppercase backdrop-blur-sm">
            {result.contentRating}
          </span>
        )}
        {inLibrary && (
          <span className="absolute right-2 bottom-2 z-10 inline-flex items-center gap-1 rounded-[2px] bg-black/55 px-1.5 py-0.5 font-mono text-[9px] tracking-[0.18em] text-[var(--color-bone)] uppercase backdrop-blur-sm">
            <Check className="h-2.5 w-2.5" aria-hidden />
            {t('browse.card.inLibrary')}
          </span>
        )}
        {result.coverUrl ? (
          <img
            src={result.coverUrl}
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
          {result.title}
        </h3>
        {result.author && (
          <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-[var(--color-bone-faint)] uppercase">
            {result.author}
          </p>
        )}
      </div>
    </Link>
  );
}
