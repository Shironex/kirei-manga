import { Link } from '@tanstack/react-router';
import { BookOpen } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type { SeriesSummary } from '@/lib/library';
import { useCoverPreview } from '@/lib/theme/coverTheme';
import { cn } from '@/lib/utils';

import { useSeriesDetail } from '../series/useSeriesDetail';
import { Cover } from './Cover';
import { chapterNumber, continueChapter, languageName, readActionLabel } from './format';
import { useOpenChapter } from './openChapter';
import { seriesProgress } from './shelf';

/**
 * Top of the library: the series read most recently, big, with one button
 * back into it, and the next few in progress beside it. With nothing in
 * progress it offers the newest series instead.
 */
export function ContinueHero({
  hero,
  mode,
  also,
}: {
  hero: SeriesSummary;
  mode: 'continue' | 'start';
  also: SeriesSummary[];
}) {
  const open = useOpenChapter();
  const preview = useCoverPreview();
  const { detail } = useSeriesDetail(hero.id);
  const current = detail?.id === hero.id ? detail : null;
  const chapter = current ? continueChapter(current) : null;
  const progress = chapter?.progress && !chapter.progress.completed ? chapter.progress : null;
  const pct = seriesProgress(hero);
  const lang = languageName(chapter?.language ?? current?.language ?? null);

  return (
    <section
      aria-label={mode === 'continue' ? 'Continue reading' : 'Start something new'}
      className={cn(
        'mb-16 grid items-end gap-x-8 gap-y-8 pt-6',
        'grid-cols-[170px_minmax(0,1fr)] xl:grid-cols-[210px_minmax(0,1fr)_300px]'
      )}
    >
      <Link
        to="/series/$seriesId"
        params={{ seriesId: String(hero.id) }}
        tabIndex={-1}
        aria-hidden
        className="block rounded-cover"
      >
        <Cover
          cover={hero.cover}
          title={hero.title}
          eager
          className="shadow-[0_30px_70px_-20px_oklch(0.05_0.04_var(--seed-h)/0.95),0_0_0_1px_oklch(1_0_0/0.06)]"
        />
      </Link>

      <div className="min-w-0">
        <p className="m-0 mb-3 text-sm font-semibold text-accent">
          {mode === 'continue' ? 'Continue reading' : 'New on your shelf'}
        </p>
        <h2 className="m-0 line-clamp-2 font-display text-6xl font-[750] tracking-[-0.02em] text-balance [font-variation-settings:'wdth'_75,'opsz'_96]">
          {hero.title}
        </h2>
        <div className="tabular mt-6 mb-3 flex min-h-[22px] flex-wrap gap-x-[18px] gap-y-1.5 text-sm text-fg-2">
          {mode === 'continue' ? (
            <>
              {chapter && (
                <span>
                  <b className="font-semibold text-fg-1">Chapter {chapterNumber(chapter)}</b> of{' '}
                  {hero.chapterCount}
                </span>
              )}
              {progress && (
                <span>
                  Page {progress.page + 1} of {progress.pageCount}
                </span>
              )}
            </>
          ) : (
            <span>
              <b className="font-semibold text-fg-1">{hero.chapterCount}</b>{' '}
              {hero.chapterCount === 1 ? 'chapter' : 'chapters'}
            </span>
          )}
          {(lang || chapter?.scanGroup) && (
            <span>{[lang, chapter?.scanGroup].filter(Boolean).join(', ')}</span>
          )}
        </div>
        {mode === 'continue' && (
          <Progress
            value={pct}
            label={`Series progress ${Math.round(pct * 100)}%`}
            size="md"
            className="mb-6 max-w-[420px]"
          />
        )}
        <div className={cn('flex flex-wrap gap-2', mode === 'start' && 'mt-6')}>
          <Button
            variant="primary"
            disabled={hero.continueChapterId === null}
            onClick={() => hero.continueChapterId && open(hero.id, hero.continueChapterId)}
          >
            <BookOpen />
            {current && chapter
              ? readActionLabel(current, chapter, 'Resume')
              : mode === 'continue'
                ? 'Resume'
                : 'Start reading'}
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/series/$seriesId" params={{ seriesId: String(hero.id) }}>
              Series details
            </Link>
          </Button>
        </div>
      </div>

      {also.length > 0 && (
        <div className="col-span-2 grid content-end gap-2 self-stretch xl:col-span-1">
          <h3 className="m-0 mb-1 text-sm font-medium text-fg-2">Also reading</h3>
          <div className="grid gap-2 max-xl:grid-cols-3">
            {also.map(s => (
              <AlsoReading key={s.id} series={s} preview={preview} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function AlsoReading({
  series,
  preview,
}: {
  series: SeriesSummary;
  preview: ReturnType<typeof useCoverPreview>;
}) {
  const pct = seriesProgress(series);
  const next = Math.min(series.completedCount + 1, series.chapterCount);
  return (
    <Link
      to="/series/$seriesId"
      params={{ seriesId: String(series.id) }}
      onPointerEnter={() => preview.enter(series.cover)}
      onPointerLeave={preview.leave}
      onFocus={() => preview.enter(series.cover)}
      onBlur={preview.leave}
      className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-xl p-2 text-fg-1 no-underline transition-colors duration-base hover:bg-fg-1/5"
    >
      <Cover cover={series.cover} title={series.title} eager />
      <span className="min-w-0">
        <strong className="block truncate font-semibold">{series.title}</strong>
        <span className="tabular mb-1.5 block text-xs text-fg-2">
          Chapter {next} of {series.chapterCount}
        </span>
        <Progress value={pct} label={`${series.title}, ${Math.round(pct * 100)}% read`} />
      </span>
    </Link>
  );
}
