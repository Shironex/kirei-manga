import type { TranslationStatus } from '@/hooks/useTranslationForPage';
import { useT } from '@/hooks/useT';

interface TranslationStatusPillProps {
  /** Lifecycle marker driven by `useTranslationForPage`. */
  status: TranslationStatus;
  /** 1-based page number — surfaces in the loading copy. */
  pageNumber: number;
  /** Failure reason for `status === 'error'`. Optional; falls back to a generic label. */
  error?: string | null;
}

/**
 * Slice G.5 — small chrome chip that surfaces the translation pipeline state
 * for the active reader page. Renders nothing when the pipeline is `'idle'`
 * or `'ready'` so the chrome stays quiet for cached / no-op pages.
 *
 * Visual identity matches the splash spinner: a thin bengara ring with
 * `border-t-transparent animate-spin` and the same mono / italic-serif
 * tracking the rest of the reader chrome uses, so the pill reads as part of
 * the editorial chrome rather than a tooltip pop-up.
 */
export function TranslationStatusPill({ status, pageNumber, error }: TranslationStatusPillProps) {
  const t = useT();

  if (status === 'idle' || status === 'ready') return null;

  if (status === 'loading') {
    return (
      <div
        data-testid="translation-status-pill"
        data-status="loading"
        role="status"
        aria-live="polite"
        className="pointer-events-none inline-flex items-center gap-2 border border-border bg-[var(--color-ink)]/85 px-3 py-1.5 backdrop-blur"
      >
        <span
          aria-hidden
          className="block h-2.5 w-2.5 shrink-0 animate-spin rounded-full border border-[var(--color-accent)] border-t-transparent"
          style={{ animationDuration: '1.2s' }}
        />
        <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase">
          {t('reader.translation.translating', { page: pageNumber })}
        </span>
      </div>
    );
  }

  // status === 'error'
  return (
    <div
      data-testid="translation-status-pill"
      data-status="error"
      role="status"
      aria-live="polite"
      title={error ?? undefined}
      className="pointer-events-none inline-flex items-center gap-2 border border-[var(--color-accent)]/60 bg-[var(--color-ink)]/85 px-3 py-1.5 backdrop-blur"
    >
      <span
        aria-hidden
        className="block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
      />
      <span className="font-mono text-[10px] tracking-[0.22em] text-[var(--color-accent)] uppercase">
        {t('reader.translation.failed')}
      </span>
    </div>
  );
}
