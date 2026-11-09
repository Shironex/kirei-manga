import { useMemo, useState, type ReactNode } from 'react';
import { getRouteApi, Link } from '@tanstack/react-router';
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  ArrowUpNarrowWide,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  LibraryBig,
  RotateCw,
} from 'lucide-react';

import { EmptyState } from '@/components/page/EmptyState';
import { PageHeader } from '@/components/page/PageHeader';
import { usePageHeading } from '@/components/page/usePageHeading';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SeriesDetail } from '@/lib/library';
import { localRef } from '@/lib/shelf';
import { usePageCover } from '@/lib/theme/coverTheme';

import { SeriesShelfCard } from '../collections/SeriesShelfCard';
import { Cover } from '../library/Cover';
import { continueChapter, languageName, readActionLabel } from '../library/format';
import { refreshLibrary, useLibrary } from '../library/libraryStore';
import { useOpenChapter } from '../library/openChapter';
import { compareTitles } from '../library/shelf';
import { TrackingCard } from '../tracking/TrackingCard';
import { ChapterList } from './ChapterList';
import { PaletteCard } from './PaletteCard';
import { useSeriesDetail } from './useSeriesDetail';

const route = getRouteApi('/shell/series/$seriesId');

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function BackLink() {
  return (
    <Link
      to="/library"
      className="inline-flex items-center gap-1.5 text-sm text-fg-2 no-underline transition-colors duration-base hover:text-fg-1"
    >
      <ArrowLeft className="size-4" aria-hidden /> Library
    </Link>
  );
}

export function SeriesPage() {
  const { seriesId } = route.useParams();
  const id = parseId(seriesId);
  const state = useSeriesDetail(id);

  if (state.status === 'error') {
    return (
      <>
        <BackLink />
        <PageHeader title="Series" className="mt-4" />
        <EmptyState
          tone="alert"
          title="This series could not be loaded"
          actions={
            <Button variant="primary" onClick={() => void refreshLibrary()}>
              <RotateCw /> Try again
            </Button>
          }
        >
          <p>{state.error}</p>
        </EmptyState>
      </>
    );
  }
  if (state.status === 'loading') return <SeriesSkeleton />;
  if (!state.detail) return <MissingSeries seriesId={seriesId} />;
  return <SeriesView key={state.detail.id} detail={state.detail} />;
}

function SeriesView({ detail }: { detail: SeriesDetail }) {
  const open = useOpenChapter();
  const heading = usePageHeading(detail.title);
  usePageCover(detail.cover);
  const { series, version } = useLibrary();
  const [newestFirst, setNewestFirst] = useState(true);

  const chapter = continueChapter(detail);
  const chapters = useMemo(
    () => (newestFirst ? [...detail.chapters].reverse() : detail.chapters),
    [detail.chapters, newestFirst]
  );
  const [prev, next] = useMemo(() => {
    const ordered = [...series].sort(compareTitles);
    const at = ordered.findIndex(s => s.id === detail.id);
    if (at < 0 || ordered.length < 2) return [null, null];
    return [
      ordered[(at - 1 + ordered.length) % ordered.length] ?? null,
      ordered[(at + 1) % ordered.length] ?? null,
    ];
  }, [series, detail.id]);

  const lang = languageName(detail.language);
  const rtl = detail.manga === 'YesAndRightToLeft';
  const byline = [
    detail.writer,
    detail.year?.toString(),
    lang,
    `${detail.chapterCount} ${detail.chapterCount === 1 ? 'chapter' : 'chapters'}`,
    rtl ? 'Right to left' : null,
  ].filter(Boolean);

  return (
    <>
      <section className="relative mb-12 grid grid-cols-[200px_minmax(0,1fr)] items-end gap-12 pt-8 xl:grid-cols-[250px_minmax(0,1fr)]">
        <Cover
          cover={detail.cover}
          title={detail.title}
          eager
          className="shadow-[0_40px_80px_-24px_oklch(0.04_0.04_var(--seed-h)),0_0_0_1px_oklch(1_0_0/0.06)]"
        />
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between gap-3">
            <BackLink />
            {prev && next && (
              <span className="flex gap-1.5">
                <SeriesStep to={prev.id} title={prev.title} label="Previous series">
                  <ChevronLeft />
                </SeriesStep>
                <SeriesStep to={next.id} title={next.title} label="Next series">
                  <ChevronRight />
                </SeriesStep>
              </span>
            )}
          </div>
          <h1
            ref={heading}
            tabIndex={-1}
            className="m-0 font-display text-5xl font-[750] tracking-[-0.015em] text-balance outline-none [font-variation-settings:'wdth'_76,'opsz'_96]"
          >
            {detail.title}
          </h1>
          <p className="tabular mt-5 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-2">
            {byline.map(item => (
              <span key={item}>{item}</span>
            ))}
          </p>
          {detail.genres.length > 0 && (
            <ul className="m-0 mb-4 flex list-none flex-wrap gap-1.5 p-0" aria-label="Genres">
              {detail.genres.map(genre => (
                <li key={genre}>
                  <Tag>{genre}</Tag>
                </li>
              ))}
            </ul>
          )}
          {detail.description && (
            <p className="m-0 mb-6 max-w-[64ch] leading-[1.65] text-fg-2">{detail.description}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              disabled={!chapter || chapter.missing}
              onClick={() => chapter && open(detail.id, chapter.id)}
            >
              <BookOpen />
              {readActionLabel(detail, chapter)}
            </Button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-12 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section aria-labelledby="chapters-heading">
          <div className="mb-3 flex items-end gap-4">
            <h2
              id="chapters-heading"
              className="m-0 font-display text-2xl leading-[1.1] font-[650] font-condensed"
            >
              Chapters
            </h2>
            <span className="tabular text-sm text-fg-3">
              {detail.completedCount} of {detail.chapterCount} read
            </span>
            <Button
              variant="quiet"
              size="sm"
              className="ml-auto"
              aria-pressed={newestFirst}
              onClick={() => setNewestFirst(v => !v)}
            >
              {newestFirst ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
              {newestFirst ? 'Newest first' : 'Oldest first'}
            </Button>
          </div>
          {detail.chapters.length > 0 ? (
            <ChapterList
              chapters={chapters}
              currentId={
                detail.lastReadAt !== null && !chapter?.progress?.completed
                  ? (chapter?.id ?? null)
                  : null
              }
              onOpen={c => open(detail.id, c.id)}
            />
          ) : (
            <p className="text-fg-3">No chapters were found in this folder.</p>
          )}
        </section>
        <aside aria-label="About this series" className="sticky top-6 grid gap-4">
          <SeriesShelfCard series={localRef(detail.id)} title={detail.title} />
          <TrackingCard
            series={{ kind: 'local', id: detail.id }}
            title={detail.title}
            year={detail.year}
            version={version}
          />
          <PaletteCard palette={detail.cover?.palette ?? null} />
          <SeriesFacts detail={detail} rtl={rtl} />
        </aside>
      </div>
    </>
  );
}

function SeriesStep({
  to,
  title,
  label,
  children,
}: {
  to: number;
  title: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`${label}: ${title}`} asChild>
          <Link to="/series/$seriesId" params={{ seriesId: String(to) }}>
            {children}
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}

function SeriesFacts({ detail, rtl }: { detail: SeriesDetail; rtl: boolean }) {
  const pages = detail.chapters.reduce((sum, c) => sum + c.pageCount, 0);
  const facts: [string, ReactNode][] = [
    [
      'Chapters',
      detail.missingCount > 0
        ? `${detail.chapterCount} on disk, ${detail.missingCount} missing`
        : `${detail.chapterCount} on disk`,
    ],
    ['Pages', pages.toLocaleString('en')],
    ['Reading', rtl ? 'Right to left' : 'Left to right'],
    ['Added', new Date(detail.addedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })],
    [
      'Folder',
      <span
        key="path"
        title={detail.path}
        className="block truncate text-left font-mono text-xs"
        dir="rtl"
      >
        {/* rtl keeps the end of a long path, the part that tells folders apart */}
        <bdi>{detail.path}</bdi>
      </span>,
    ],
  ];
  return (
    <section
      aria-labelledby="facts-heading"
      className="rounded-panel border border-line bg-ink-1 p-6"
    >
      <h2 id="facts-heading" className="m-0 mb-4 font-display text-lg font-[650] font-condensed">
        On your shelf
      </h2>
      <dl className="m-0 grid grid-cols-[80px_minmax(0,1fr)] gap-x-3 gap-y-2.5 text-sm">
        {facts.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-fg-3">{term}</dt>
            <dd className="tabular m-0 min-w-0 text-fg-2">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SeriesSkeleton() {
  const bar =
    'animate-shimmer rounded bg-[linear-gradient(100deg,var(--ink-2)_30%,var(--ink-3)_50%,var(--ink-2)_70%)] bg-[length:300%_100%]';
  return (
    <div
      aria-busy="true"
      aria-label="Loading series"
      className="grid grid-cols-[200px_minmax(0,1fr)] items-end gap-12 pt-8 xl:grid-cols-[250px_minmax(0,1fr)]"
    >
      <div className={`aspect-[2/3] rounded-cover ${bar}`} />
      <div className="grid gap-4">
        <div className={`h-12 w-2/3 ${bar}`} />
        <div className={`h-3 w-1/2 ${bar}`} />
        <div className={`h-3 w-3/4 ${bar}`} />
        <div className={`h-10 w-48 rounded-pill ${bar}`} />
      </div>
    </div>
  );
}

function MissingSeries({ seriesId }: { seriesId: string }) {
  return (
    <>
      <BackLink />
      <PageHeader title="Missing series" className="mt-4" />
      <EmptyState
        title="This series is not in your library"
        actions={
          <Button variant="primary" asChild>
            <Link to="/library">
              <LibraryBig /> Back to the library
            </Link>
          </Button>
        }
      >
        <p>
          Nothing is filed under <code className="font-mono text-sm text-fg-1">{seriesId}</code>. It
          may have been removed, or its folder moved since the last scan.
        </p>
      </EmptyState>
    </>
  );
}
