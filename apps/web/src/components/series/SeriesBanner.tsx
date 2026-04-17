import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { MangaDexSeriesDetail } from '@kireimanga/shared';
import { useFollow } from '@/hooks/useFollow';
import { useLibraryStore } from '@/stores/library-store';
import { useT } from '@/hooks/useT';
import { translateMangaDexTag } from '@/i18n/mangadexTags';

interface Props {
  series: MangaDexSeriesDetail;
}

export function SeriesBanner({ series }: Props) {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const src = series.bannerUrl ?? series.coverUrl;
  const { followed, busy, toggle } = useFollow(series.id);
  const localEntry = useLibraryStore(s => {
    const localId = s.mangadexIndex[series.id];
    if (!localId) return null;
    return s.series.find(x => x.id === localId) ?? null;
  });
  const continueChapterId = localEntry?.lastChapterId;

  return (
    <section className="flex flex-col gap-8 md:flex-row md:items-start md:gap-10">
      <div className="aspect-[2/3] w-full max-w-[280px] shrink-0 overflow-hidden rounded-[2px] bg-[var(--color-ink-sunken)]">
        {src ? (
          <img
            src={src}
            alt=""
            onLoad={() => setLoaded(true)}
            className={[
              'h-full w-full object-cover transition-opacity duration-500 ease-[var(--ease-out-quart)]',
              loaded ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-kanji text-[48px] text-[var(--color-bone-faint)] opacity-50">
              綺
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
          {t('series.eyebrow')}
        </span>
        <h1 className="font-display mt-3 text-[40px] leading-[1.05] font-medium text-foreground">
          {series.title}
        </h1>
        {series.titleJapanese && (
          <p className="font-kanji mt-2 text-[15px] text-[var(--color-bone-muted)]">
            {series.titleJapanese}
          </p>
        )}

        <MetaRow series={series} />

        <div className="mt-5 flex items-center gap-3">
          {continueChapterId && (
            <Link
              to={`/reader/${series.id}/${continueChapterId}`}
              className="inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 font-mono text-[11px] tracking-[0.22em] text-[var(--color-accent-foreground)] uppercase transition-opacity hover:opacity-90"
            >
              {t('series.continue')}
            </Link>
          )}
          <button
            type="button"
            aria-pressed={followed}
            disabled={busy}
            onClick={() => void toggle()}
            className={[
              'h-9 rounded-[2px] px-4 font-mono text-[11px] tracking-[0.22em] uppercase transition-colors',
              followed
                ? continueChapterId
                  ? 'border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]'
                  : 'border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-foreground)]'
                : 'border border-border text-foreground hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
              busy ? 'cursor-wait opacity-60' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {followed ? t('series.following') : t('series.follow')}
          </button>
        </div>

        {series.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {series.tags.map(tag => (
              <span
                key={tag}
                className="rounded-[2px] border border-border px-2 py-0.5 text-[12px] text-[var(--color-bone-muted)]"
              >
                {translateMangaDexTag(tag, t)}
              </span>
            ))}
          </div>
        )}

        {series.description && <Synopsis text={series.description} />}
      </div>
    </section>
  );
}

function MetaRow({ series }: { series: MangaDexSeriesDetail }) {
  const t = useT();
  const parts: string[] = [];
  if (series.author) parts.push(series.author);
  if (series.artist && series.artist !== series.author) parts.push(series.artist);
  if (series.year) parts.push(String(series.year));
  if (series.status) parts.push(t(`series.status.${series.status}`));
  if (series.contentRating) parts.push(t(`series.rating.${series.contentRating}`));
  // `demographic === 'none'` is a MangaDex sentinel for "unspecified" — hide it
  // rather than showing a literal "None" chip.
  if (series.demographic && series.demographic !== 'none') {
    parts.push(t(`series.demographic.${series.demographic}`));
  }
  if (parts.length === 0) return null;
  return (
    <p className="mt-4 font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
      {parts.join(' · ')}
    </p>
  );
}

function Synopsis({ text }: { text: string }) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-6">
      <p
        className={[
          'font-display text-[14.5px] leading-[1.7] font-[360] text-foreground',
          expanded ? '' : 'line-clamp-5',
        ].join(' ')}
      >
        {text}
      </p>
      <button
        type="button"
        onClick={() => setExpanded(e => !e)}
        className="mt-2 font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase hover:text-foreground"
      >
        {expanded ? t('series.collapse') : t('series.readMore')}
      </button>
    </div>
  );
}
