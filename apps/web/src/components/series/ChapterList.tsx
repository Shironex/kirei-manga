import type * as React from 'react';
import { Check, ChevronDown, Download, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ChapterListItem, LibraryChapterStatePatch } from '@kireimanga/shared';
import { relativeFromIso } from '@/lib/relativeTime';
import { useDownloadChapter } from '@/hooks/useDownloadChapter';
import { useSettingsStore } from '@/stores/settings-store';
import { useT } from '@/hooks/useT';

type ChapterStateMap = Record<string, LibraryChapterStatePatch> | null;

interface Props {
  chapters: ChapterListItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  languages: string[];
  lang: string | undefined;
  onLangChange: (lang: string) => void;
  mangadexSeriesId: string;
  states: ChapterStateMap;
}

export function ChapterList({
  chapters,
  loading,
  error,
  retry,
  languages,
  lang,
  onLangChange,
  mangadexSeriesId,
  states,
}: Props) {
  const t = useT();
  return (
    <section className="mt-14 flex flex-col">
      <header className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
          {t('series.chapters')}
        </span>
        <LanguageFilter languages={languages} value={lang} onChange={onLangChange} />
      </header>

      <div className="mt-4">
        {loading && (
          <div className="flex flex-col">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="skeleton-pulse h-10 border-b border-border bg-[var(--color-ink-raised)] last:border-b-0"
              />
            ))}
          </div>
        )}

        {!loading && error && (
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
        )}

        {!loading && !error && chapters.length === 0 && (
          <div className="flex items-center gap-5 py-10">
            <span className="font-kanji text-[40px] text-[var(--color-accent)] opacity-90">空</span>
            <div>
              <h3 className="font-display text-[18px] leading-snug font-[350] text-foreground">
                {t('chapterList.empty.title')}
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {t('chapterList.empty.body')}
              </p>
            </div>
          </div>
        )}

        {!loading && !error && chapters.length > 0 && (
          <div role="table" className="flex flex-col">
            {chapters.map(ch => (
              <Row
                key={ch.id}
                chapter={ch}
                mangadexSeriesId={mangadexSeriesId}
                state={states ? (states[ch.id] ?? null) : null}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Read-state dot. The wrapper reserves width unconditionally so the row layout
 * doesn't shift once states load in.
 *   - unread / no state         → solid bengara
 *   - in-progress (lastReadPage > 0, !isRead) → 50% bengara
 *   - read                      → hairline ring
 */
function renderReadDot(state: LibraryChapterStatePatch | null) {
  const base = 'inline-block h-1.5 w-1.5 rounded-full';
  let dot: React.ReactElement;
  if (!state || (!state.isRead && state.lastReadPage === 0)) {
    dot = <span className={`${base} bg-[var(--color-accent)]`} />;
  } else if (state.isRead) {
    dot = <span className={`${base} border border-[var(--color-bone-faint)]`} />;
  } else {
    dot = <span className={`${base} bg-[var(--color-accent)]/50`} />;
  }
  return (
    <span aria-hidden className="inline-flex h-1.5 w-1.5 items-center justify-center">
      {dot}
    </span>
  );
}

function Row({
  chapter,
  mangadexSeriesId,
  state,
}: {
  chapter: ChapterListItem;
  mangadexSeriesId: string;
  state: LibraryChapterStatePatch | null;
}) {
  const lang = useSettingsStore(s => s.settings?.language ?? 'en');
  const dash = <span className="text-[var(--color-bone-faint)]">—</span>;
  const chapterNumberRaw = chapter.chapter ? Number(chapter.chapter) : undefined;
  const volumeNumberRaw = chapter.volume ? Number(chapter.volume) : undefined;
  const linkState = {
    chapter: {
      chapterNumber:
        typeof chapterNumberRaw === 'number' && Number.isFinite(chapterNumberRaw)
          ? chapterNumberRaw
          : undefined,
      volumeNumber:
        typeof volumeNumberRaw === 'number' && Number.isFinite(volumeNumberRaw)
          ? volumeNumberRaw
          : undefined,
      title: chapter.title ?? undefined,
    },
  };
  return (
    <Link
      to={`/reader/${mangadexSeriesId}/${chapter.id}`}
      state={linkState}
      role="row"
      className="grid grid-cols-[3rem_1fr] items-center gap-x-4 gap-y-1 border-b border-border py-2.5 text-[13px] hover:bg-[var(--color-ink-raised)] last:border-b-0 md:grid-cols-[3rem_3rem_1fr_14rem_6rem_1rem_2.5rem] md:gap-y-0"
    >
      <span className="font-mono text-[11px] tracking-[0.16em] text-[var(--color-bone-faint)] uppercase">
        {chapter.volume ? `v${chapter.volume}` : dash}
      </span>
      <span className="font-mono text-[11px] tracking-[0.16em] text-[var(--color-bone-muted)] uppercase md:block">
        {chapter.chapter ? `ch${chapter.chapter}` : dash}
      </span>
      <span className="col-span-2 truncate text-foreground md:col-span-1">
        {chapter.title ? chapter.title : dash}
      </span>
      <span className="col-span-2 truncate text-[12px] text-[var(--color-bone-muted)] md:col-span-1">
        {chapter.scanlationGroup ? chapter.scanlationGroup : dash}
      </span>
      <span className="text-[12px] text-[var(--color-bone-muted)]">
        {relativeFromIso(chapter.publishAt, lang)}
      </span>
      {renderReadDot(state)}
      <DownloadButton
        chapterId={chapter.id}
        mangadexSeriesId={mangadexSeriesId}
        isDownloaded={state?.isDownloaded ?? false}
      />
    </Link>
  );
}

function DownloadButton({
  chapterId,
  mangadexSeriesId,
  isDownloaded,
}: {
  chapterId: string;
  mangadexSeriesId: string;
  isDownloaded: boolean;
}) {
  const t = useT();
  const { status, progress, download } = useDownloadChapter(
    chapterId,
    mangadexSeriesId,
    isDownloaded
  );

  if (status === 'complete') {
    return (
      <span
        className="hidden items-center justify-center text-[var(--color-bone-muted)] md:flex"
        aria-label={t('chapterList.downloadedAria')}
      >
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (status === 'downloading') {
    return (
      <span
        className="hidden items-center justify-center text-[var(--color-bone-muted)] md:flex"
        aria-label={
          progress
            ? t('chapterList.downloadingAriaProgress', {
                current: progress.current,
                total: progress.total,
              })
            : t('chapterList.downloadingAria')
        }
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        download();
      }}
      className="hidden items-center justify-center text-[var(--color-bone-faint)] transition-colors hover:text-foreground md:flex"
      aria-label={t('chapterList.downloadAria')}
    >
      <Download className="h-3.5 w-3.5" />
    </button>
  );
}

function LanguageFilter({
  languages,
  value,
  onChange,
}: {
  languages: string[];
  value: string | undefined;
  onChange: (lang: string) => void;
}) {
  if (languages.length === 0) return null;
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="h-8 appearance-none rounded-sm border border-border bg-[var(--color-ink-sunken)] px-2.5 pr-7 text-[12px] text-foreground"
      >
        {languages.map(code => (
          <option key={code} value={code}>
            {labelForLang(code)}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-bone-faint)]"
        aria-hidden
      />
    </div>
  );
}

function labelForLang(code: string): string {
  try {
    const locales =
      typeof navigator !== 'undefined' && navigator.language ? [navigator.language, 'en'] : ['en'];
    const dn = new Intl.DisplayNames(locales, { type: 'language' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}
