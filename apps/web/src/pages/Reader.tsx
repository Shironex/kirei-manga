import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useChapterPages } from '@/hooks/useChapterPages';
import { useReaderStore } from '@/stores/reader-store';

export function ReaderPage() {
  const { mangadexSeriesId, chapterId } = useParams<{
    mangadexSeriesId: string;
    chapterId: string;
  }>();
  const navigate = useNavigate();

  const reset = useReaderStore(s => s.reset);
  const setTotalPages = useReaderStore(s => s.setTotalPages);

  const { pages, loading, error, retry } = useChapterPages(chapterId);

  // Reset reader state on chapter/series change.
  useEffect(() => {
    if (!chapterId || !mangadexSeriesId) return;
    reset({ chapterId, seriesId: mangadexSeriesId });
  }, [chapterId, mangadexSeriesId, reset]);

  // Sync total page count once pages resolve.
  useEffect(() => {
    setTotalPages(pages.length);
  }, [pages.length, setTotalPages]);

  // Lock body scroll while the reader is mounted.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-ink-sunken)]">
      <header className="app-drag flex h-11 shrink-0 items-center justify-between border-b border-border bg-[var(--color-ink)]/70 px-5 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="app-no-drag group inline-flex items-center gap-2 text-[12px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.4] transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>
        <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
          {pages.length > 0 ? `Page 1 / ${pages.length}` : 'Page — / —'}
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center overflow-auto">
        {loading && (
          <div className="flex flex-col items-center gap-3">
            <span className="font-kanji text-[40px] text-[var(--color-accent)] opacity-90" aria-hidden>
              読
            </span>
            <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
              Loading pages…
            </span>
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

        {!loading && !error && pages.length === 0 && (
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="font-kanji text-[40px] text-[var(--color-accent)] opacity-90" aria-hidden>
              空
            </span>
            <span className="font-display max-w-[32ch] text-[15px] leading-snug font-[360] text-muted-foreground">
              No pages were returned for this chapter.
            </span>
          </div>
        )}

        {!loading && !error && pages.length > 0 && (
          <div className="flex flex-col items-center gap-2 py-6">
            {pages.map((url, i) => (
              <img
                key={`${url}-${i}`}
                src={url}
                alt={`Page ${i + 1}`}
                className="max-w-full"
                draggable={false}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
