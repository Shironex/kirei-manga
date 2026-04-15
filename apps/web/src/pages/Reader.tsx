import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function ReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();

  return (
    <div className="relative flex h-full w-full flex-col bg-[var(--color-ink-sunken)]">
      <header className="app-drag flex h-11 shrink-0 items-center justify-between border-b border-border bg-[var(--color-ink)]/70 px-5 backdrop-blur">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="app-no-drag group inline-flex items-center gap-2 text-[12px] tracking-wide text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 stroke-[1.4] transition-transform group-hover:-translate-x-0.5" />
          Library
        </button>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="font-kanji text-[var(--color-bone-faint)]" aria-hidden>
            巻
          </span>
          <span className="font-mono tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
            {chapterId ?? 'no chapter'}
          </span>
        </div>
        <span className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-faint)] uppercase">
          Page — / —
        </span>
      </header>

      <main className="flex flex-1 items-center justify-center overflow-hidden">
        <div className="animate-fade-up relative flex h-[78%] aspect-[2/3] max-h-[90%] items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 border border-[var(--color-rule)] bg-[var(--color-ink-raised)]"
          />
          <span
            aria-hidden
            className="absolute top-3 right-3 bottom-3 left-3 border border-dashed border-[var(--color-rule)]"
          />
          <div className="relative flex flex-col items-center gap-3 text-center">
            <span
              className="font-kanji text-[72px] leading-none text-[var(--color-accent)]/90"
              aria-hidden
            >
              頁
            </span>
            <span className="font-display max-w-[32ch] text-[16px] leading-snug font-[360] text-muted-foreground">
              No chapter loaded. Open a series from your library to begin reading.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
