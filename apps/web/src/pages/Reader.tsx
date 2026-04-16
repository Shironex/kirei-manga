import { useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useChapterPages } from '@/hooks/useChapterPages';
import { useImagePreload } from '@/hooks/useImagePreload';
import { useReaderKeyboard } from '@/hooks/useReaderKeyboard';
import { useReaderPrefs } from '@/hooks/useReaderPrefs';
import { useReaderStore } from '@/stores/reader-store';
import { SinglePageView } from '@/components/reader/SinglePageView';
import { DoublePageView } from '@/components/reader/DoublePageView';
import { WebtoonView } from '@/components/reader/WebtoonView';
import { ReaderChrome } from '@/components/reader/ReaderChrome';

const CHROME_HOTZONE_PX = 72;
const CHROME_AUTO_HIDE_MS = 2000;

async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen();
    }
  } catch {
    // Fullscreen denied (e.g. permissions); silently ignore.
  }
}

export function ReaderPage() {
  const { mangadexSeriesId, chapterId } = useParams<{
    mangadexSeriesId: string;
    chapterId: string;
  }>();
  const navigate = useNavigate();

  const reset = useReaderStore(s => s.reset);
  const setTotalPages = useReaderStore(s => s.setTotalPages);
  const pageIndex = useReaderStore(s => s.pageIndex);
  const fit = useReaderStore(s => s.fit);
  const mode = useReaderStore(s => s.mode);
  const direction = useReaderStore(s => s.direction);
  const next = useReaderStore(s => s.next);
  const prev = useReaderStore(s => s.prev);
  const first = useReaderStore(s => s.first);
  const last = useReaderStore(s => s.last);
  const chromeVisible = useReaderStore(s => s.chromeVisible);
  const showChrome = useReaderStore(s => s.showChrome);
  const hideChrome = useReaderStore(s => s.hideChrome);

  // Hydrates store from desktop-persisted prefs and exposes a debounced
  // setter that writes back through the socket bridge.
  const { setPrefs } = useReaderPrefs(mangadexSeriesId);

  useReaderKeyboard({
    onNext: next,
    onPrev: prev,
    onFirst: first,
    onLast: last,
    onSetFit: fit => setPrefs({ fit }),
    onToggleFullscreen: () => void toggleFullscreen(),
    direction,
    mode,
  });

  const { pages, loading, error, retry } = useChapterPages(chapterId);

  useEffect(() => {
    if (!chapterId || !mangadexSeriesId) return;
    reset({ chapterId, seriesId: mangadexSeriesId });
  }, [chapterId, mangadexSeriesId, reset]);

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

  // Auto-hide chrome unless the cursor enters the top hotzone.
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const scheduleHide = () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => hideChrome(), CHROME_AUTO_HIDE_MS);
    };

    const onMove = (e: MouseEvent) => {
      if (e.clientY <= CHROME_HOTZONE_PX) {
        showChrome();
        scheduleHide();
      }
    };

    scheduleHide();
    window.addEventListener('mousemove', onMove);
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
      window.removeEventListener('mousemove', onMove);
    };
  }, [showChrome, hideChrome]);

  // Warm the next pages. Webtoon benefits from a deeper window since the user
  // can scroll quickly; single/double only need the immediate next few.
  useImagePreload(pages, pageIndex, mode === 'webtoon' ? 5 : 3);

  if (loading) {
    return (
      <ReaderShell onBack={() => navigate(-1)} indicator="Loading…">
        <div className="flex flex-col items-center gap-3">
          <span className="font-kanji text-[40px] text-[var(--color-accent)] opacity-90" aria-hidden>
            読
          </span>
          <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
            Loading pages…
          </span>
        </div>
      </ReaderShell>
    );
  }

  if (error) {
    return (
      <ReaderShell onBack={() => navigate(-1)} indicator="Error">
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
      </ReaderShell>
    );
  }

  if (pages.length === 0) {
    return (
      <ReaderShell onBack={() => navigate(-1)} indicator="Empty">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="font-kanji text-[40px] text-[var(--color-accent)] opacity-90" aria-hidden>
            空
          </span>
          <span className="font-display max-w-[32ch] text-[15px] leading-snug font-[360] text-muted-foreground">
            No pages were returned for this chapter.
          </span>
        </div>
      </ReaderShell>
    );
  }

  const safeIndex = Math.min(pageIndex, pages.length - 1);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[var(--color-ink-sunken)]">
      {mode === 'single' && (
        <SinglePageView
          pageUrl={pages[safeIndex]}
          pageNumber={safeIndex + 1}
          totalPages={pages.length}
          fit={fit}
        />
      )}
      {mode === 'double' && (
        <DoublePageView
          pages={pages}
          primaryIndex={safeIndex}
          fit={fit}
          direction={direction}
        />
      )}
      {mode === 'webtoon' && <WebtoonView pages={pages} />}

      <ReaderChrome
        pageNumber={safeIndex + 1}
        totalPages={pages.length}
        visible={chromeVisible}
        mode={mode}
        direction={direction}
        fit={fit}
        onPrefsChange={setPrefs}
      />
    </div>
  );
}

function ReaderShell({
  onBack,
  indicator,
  children,
}: {
  onBack: () => void;
  indicator: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-[var(--color-ink-sunken)]">
      <header className="app-drag flex h-11 shrink-0 items-center justify-between border-b border-border bg-[var(--color-ink)]/70 px-5 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="app-no-drag group inline-flex items-center gap-2 text-[12px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.4] transition-transform group-hover:-translate-x-0.5" />
          Back
        </button>
        <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
          {indicator}
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center overflow-hidden">{children}</main>
    </div>
  );
}
