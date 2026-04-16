import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ChapterListItem } from '@kireimanga/shared';
import { relativeFromIso } from '@/lib/relativeTime';

interface Props {
  chapters: ChapterListItem[];
  loading: boolean;
  error: string | null;
  retry: () => void;
  languages: string[];
  lang: string | undefined;
  onLangChange: (lang: string) => void;
  mangadexSeriesId: string;
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
}: Props) {
  return (
    <section className="mt-14 flex flex-col">
      <header className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
          Chapters
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
        )}

        {!loading && !error && chapters.length === 0 && (
          <div className="flex items-center gap-5 py-10">
            <span className="font-kanji text-[40px] text-[var(--color-accent)] opacity-90">空</span>
            <div>
              <h3 className="font-display text-[18px] leading-snug font-[350] text-foreground">
                No chapters here yet.
              </h3>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Try another translation, or check back later.
              </p>
            </div>
          </div>
        )}

        {!loading && !error && chapters.length > 0 && (
          <div role="table" className="flex flex-col">
            {chapters.map(ch => (
              <Row key={ch.id} chapter={ch} mangadexSeriesId={mangadexSeriesId} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Row({
  chapter,
  mangadexSeriesId,
}: {
  chapter: ChapterListItem;
  mangadexSeriesId: string;
}) {
  const dash = <span className="text-[var(--color-bone-faint)]">—</span>;
  return (
    <Link
      to={`/reader/${mangadexSeriesId}/${chapter.id}`}
      role="row"
      className="grid grid-cols-[3rem_1fr] items-center gap-x-4 gap-y-1 border-b border-border py-2.5 text-[13px] hover:bg-[var(--color-ink-raised)] last:border-b-0 md:grid-cols-[3rem_3rem_1fr_14rem_6rem_1rem] md:gap-y-0"
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
        {relativeFromIso(chapter.publishAt)}
      </span>
      {/* TODO(slice-e): read-state dot */}
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full" />
    </Link>
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
      typeof navigator !== 'undefined' && navigator.language
        ? [navigator.language, 'en']
        : ['en'];
    const dn = new Intl.DisplayNames(locales, { type: 'language' });
    return dn.of(code) ?? code;
  } catch {
    return code;
  }
}
