import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  LibraryEvents,
  TranslationEvents,
  type LibraryMarkSeenPayload,
  type LibraryMarkSeenResponse,
  type TranslationSettings,
  type TranslationSetSeriesOverridePayload,
  type TranslationSetSeriesOverrideResponse,
} from '@kireimanga/shared';
import { useMangaDexSeries } from '@/hooks/useMangaDexSeries';
import { useMangaDexChapters } from '@/hooks/useMangaDexChapters';
import { useChapterStates } from '@/hooks/useChapterStates';
import { useLibraryStore } from '@/stores/library-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useToast } from '@/hooks/useToast';
import { emitWithResponse } from '@/lib/socket';
import { SeriesBanner } from '@/components/series/SeriesBanner';
import { ChapterList } from '@/components/series/ChapterList';
import { BookmarksPanel } from '@/components/series/BookmarksPanel';
import { BackButton } from '@/components/layout/BackButton';
import { TranslationOverrideForm } from '@/components/translation/TranslationOverrideForm';
import { useT } from '@/hooks/useT';

export function SeriesDetailPage() {
  const t = useT();
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
  }, [series?.id, defaultChapterLanguage]);

  const chaptersState = useMangaDexChapters(mangadexId, lang);

  const localSeriesId = useLibraryStore(s =>
    mangadexId ? (s.mangadexIndex[mangadexId] ?? null) : null
  );

  // Pull the local row for this MangaDex series — its `translationOverride`
  // is the source of truth for the override panel below the chapter list.
  // `null` while the series isn't followed yet (the panel hides itself).
  const localSeriesRow = useLibraryStore(s =>
    localSeriesId ? (s.series.find(entry => entry.id === localSeriesId) ?? null) : null
  );

  // Clear the new-chapter badge when the user opens the series detail page.
  useEffect(() => {
    if (!localSeriesId || localSeriesId.startsWith('pending:')) return;
    void emitWithResponse<LibraryMarkSeenPayload, LibraryMarkSeenResponse>(
      LibraryEvents.MARK_SEEN,
      { seriesId: localSeriesId }
    );
    // Also clear the local store badge immediately for responsiveness.
    useLibraryStore.setState(state => ({
      series: state.series.map(s => (s.id === localSeriesId ? { ...s, newChapterCount: 0 } : s)),
    }));
  }, [localSeriesId]);

  const chapterIds = useMemo(() => chaptersState.chapters.map(c => c.id), [chaptersState.chapters]);
  const chapterStates = useChapterStates(localSeriesId, chapterIds);

  if (loading && !series) {
    return (
      <>
        <BackButton className="mb-6" />
        <div className="flex flex-col gap-8 md:flex-row md:gap-10">
          <div className="skeleton-pulse aspect-[2/3] w-full max-w-[280px] shrink-0 rounded-[2px] bg-[var(--color-ink-raised)]" />
          <div className="flex flex-1 flex-col gap-4 pt-4">
            <div className="skeleton-pulse h-px w-full bg-border" />
            <div className="skeleton-pulse h-px w-full bg-border" />
            <div className="skeleton-pulse h-px w-full bg-border" />
          </div>
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <BackButton className="mb-6" />
        <div className="animate-fade-up flex flex-col items-start gap-3 border-l-2 border-[var(--color-accent)] py-2 pl-5">
          <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
            {t('common.error.eyebrow')}
          </span>
          <p className="max-w-[52ch] text-[14px] text-foreground">{error}</p>
          <button
            type="button"
            onClick={retry}
            className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-muted)] underline-offset-4 uppercase hover:text-foreground hover:underline"
          >
            {t('common.retry')}
          </button>
        </div>
      </>
    );
  }

  if (!series) return null;

  const inLibrary = !!localSeriesId && !localSeriesId.startsWith('pending:');

  return (
    <>
      <BackButton className="mb-6" />
      <SeriesBanner series={series} />
      {inLibrary && localSeriesId && localSeriesRow && (
        <TranslationOverridePanel
          seriesId={localSeriesId}
          seriesTitle={series.title}
          override={localSeriesRow.translationOverride}
        />
      )}
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

/**
 * Inline expand-to-edit panel for a MangaDex series' translation override
 * (Slice H.2). The MangaDex SeriesDetail page has no edit drawer today —
 * this is the first per-series setting users can edit on a MangaDex row.
 *
 * Saves go straight to the source-agnostic `translation:set-series-override`
 * channel. After a successful save we patch the library store in place so the
 * panel reflects the new override without waiting for a `library:get-all`
 * refresh.
 */
function TranslationOverridePanel({
  seriesId,
  seriesTitle,
  override,
}: {
  seriesId: string;
  seriesTitle: string;
  override: Partial<TranslationSettings> | undefined;
}) {
  const t = useT();
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleChange = async (
    next: Partial<TranslationSettings> | undefined
  ): Promise<void> => {
    setSaving(true);
    try {
      const response = await emitWithResponse<
        TranslationSetSeriesOverridePayload,
        TranslationSetSeriesOverrideResponse
      >(TranslationEvents.SET_SERIES_OVERRIDE, { seriesId, override: next });
      if (response.error || !response.series) {
        throw new Error(
          response.error ?? 'translation:set-series-override returned no series'
        );
      }
      // Patch the library store so the form reflects the saved override on the
      // very next render — avoids a flash of "Use global" while the next
      // library:get-all settles.
      const saved = response.series;
      useLibraryStore.setState(state => ({
        series: state.series.map(s => (s.id === seriesId ? { ...s, ...saved } : s)),
      }));
      toast.success(t('series.translationOverride.toast.savedBody', { title: seriesTitle }), {
        title: t('series.translationOverride.toast.savedTitle'),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message, {
        title: t('series.translationOverride.toast.errorTitle'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="mt-10 border-t border-border pt-8"
      data-testid="series-translation-override-panel"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="series-translation-override-body"
        onClick={() => setExpanded(v => !v)}
        className="group flex w-full items-baseline justify-between gap-4 text-left"
      >
        <div className="flex flex-col gap-1">
          <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
            {t('series.translationOverride.eyebrow')}
          </span>
          <span className="font-display text-[16px] font-[380] tracking-[-0.008em] text-foreground transition-colors group-hover:text-[var(--color-accent)]">
            {t('series.translationOverride.expand')}
          </span>
          <span className="text-[12px] text-[var(--color-bone-faint)]">
            {t('series.translationOverride.expand.hint')}
          </span>
        </div>
        <span
          aria-hidden
          className={[
            'font-mono text-[18px] leading-none text-[var(--color-bone-muted)] transition-transform',
            expanded ? 'rotate-45' : '',
          ].join(' ')}
        >
          +
        </span>
      </button>

      {expanded && (
        <div
          id="series-translation-override-body"
          className={[
            'mt-6 transition-opacity',
            saving ? 'pointer-events-none opacity-60' : 'opacity-100',
          ].join(' ')}
        >
          <TranslationOverrideForm override={override} onChange={handleChange} />
        </div>
      )}
    </section>
  );
}
