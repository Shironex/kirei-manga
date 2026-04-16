import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { LibraryEvents, type LibraryMarkSeenPayload, type LibraryMarkSeenResponse } from '@kireimanga/shared';
import { useMangaDexSeries } from '@/hooks/useMangaDexSeries';
import { useMangaDexChapters } from '@/hooks/useMangaDexChapters';
import { useChapterStates } from '@/hooks/useChapterStates';
import { useLibraryStore } from '@/stores/library-store';
import { useSettingsStore } from '@/stores/settings-store';
import { emitWithResponse } from '@/lib/socket';
import { SeriesBanner } from '@/components/series/SeriesBanner';
import { ChapterList } from '@/components/series/ChapterList';
import { BookmarksPanel } from '@/components/series/BookmarksPanel';

export function SeriesDetailPage() {
  const { mangadexId } = useParams<{ mangadexId: string }>();
  const { series, loading, error, retry } = useMangaDexSeries(mangadexId);

  const defaultChapterLanguage = useSettingsStore(
    s => s.settings?.library.defaultChapterLanguage ?? 'en'
  );
  const [lang, setLang] = useState<string | undefined>(undefined);

  // Pick initial language once per series — prefer the user's default
  // chapter language when available, else fall back to 'en', else the first
  // available translation.
  useEffect(() => {
    if (!series) return;
    const langs = series.availableTranslatedLanguages;
    const next = langs.includes(defaultChapterLanguage)
      ? defaultChapterLanguage
      : langs.includes('en')
        ? 'en'
        : langs[0];
    setLang(next);
  }, [series?.id, defaultChapterLanguage]); // eslint-disable-line react-hooks/exhaustive-deps

  const chaptersState = useMangaDexChapters(mangadexId, lang);

  const localSeriesId = useLibraryStore(s => (mangadexId ? (s.mangadexIndex[mangadexId] ?? null) : null));

  // Clear the new-chapter badge when the user opens the series detail page.
  useEffect(() => {
    if (!localSeriesId || localSeriesId.startsWith('pending:')) return;
    void emitWithResponse<LibraryMarkSeenPayload, LibraryMarkSeenResponse>(
      LibraryEvents.MARK_SEEN,
      { seriesId: localSeriesId }
    );
    // Also clear the local store badge immediately for responsiveness.
    useLibraryStore.setState(state => ({
      series: state.series.map(s =>
        s.id === localSeriesId ? { ...s, newChapterCount: 0 } : s
      ),
    }));
  }, [localSeriesId]);

  const chapterIds = useMemo(
    () => chaptersState.chapters.map(c => c.id),
    [chaptersState.chapters]
  );
  const chapterStates = useChapterStates(localSeriesId, chapterIds);

  if (loading && !series) {
    return (
      <div className="flex flex-col gap-8 md:flex-row md:gap-10">
        <div className="skeleton-pulse aspect-[2/3] w-full max-w-[280px] shrink-0 rounded-[2px] bg-[var(--color-ink-raised)]" />
        <div className="flex flex-1 flex-col gap-4 pt-4">
          <div className="skeleton-pulse h-px w-full bg-border" />
          <div className="skeleton-pulse h-px w-full bg-border" />
          <div className="skeleton-pulse h-px w-full bg-border" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-up flex flex-col items-start gap-3 border-l-2 border-[var(--color-accent)] py-2 pl-5">
        <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
          Something went sideways
        </span>
        <p className="max-w-[52ch] text-[14px] text-foreground">{error}</p>
        <button
          type="button"
          onClick={retry}
          className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-foreground hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!series) return null;

  const inLibrary = !!localSeriesId && !localSeriesId.startsWith('pending:');

  return (
    <>
      <SeriesBanner series={series} />
      <ChapterList
        chapters={chaptersState.chapters}
        loading={chaptersState.loading}
        error={chaptersState.error}
        retry={chaptersState.retry}
        languages={series.availableTranslatedLanguages}
        lang={lang}
        onLangChange={setLang}
        mangadexSeriesId={series.id}
        states={chapterStates}
      />
      {inLibrary && <BookmarksPanel mangadexSeriesId={series.id} />}
    </>
  );
}
