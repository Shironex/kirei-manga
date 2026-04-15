import { useState } from 'react';
import type { MangaDexSeriesDetail } from '@kireimanga/shared';

interface Props {
  series: MangaDexSeriesDetail;
}

export function SeriesBanner({ series }: Props) {
  const [loaded, setLoaded] = useState(false);
  const src = series.bannerUrl ?? series.coverUrl;

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
          MangaDex · Series
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

        <div className="mt-5">
          {/* TODO(slice-b-phase-5): wire useFollow(mangadexId) */}
          {/* followed variant (phase 5):
              className="h-9 px-4 rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] text-[11px] font-mono tracking-[0.22em] uppercase text-[var(--color-accent-foreground)]" */}
          <button
            type="button"
            aria-disabled="true"
            disabled
            className="h-9 rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            Follow
          </button>
        </div>

        {series.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {series.tags.map(tag => (
              <span
                key={tag}
                className="rounded-[2px] border border-border px-2 py-0.5 text-[12px] text-[var(--color-bone-muted)]"
              >
                {tag}
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
  const parts: string[] = [];
  if (series.author) parts.push(series.author);
  if (series.artist && series.artist !== series.author) parts.push(series.artist);
  if (series.year) parts.push(String(series.year));
  if (series.status) parts.push(series.status);
  if (series.contentRating) parts.push(series.contentRating);
  if (series.demographic) parts.push(series.demographic);
  if (parts.length === 0) return null;
  return (
    <p className="mt-4 font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
      {parts.join(' · ')}
    </p>
  );
}

function Synopsis({ text }: { text: string }) {
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
        {expanded ? 'Collapse' : 'Read more'}
      </button>
    </div>
  );
}
