import { X } from 'lucide-react';
import { useT } from '@/hooks/useT';

export interface TranslationErrorBannerProps {
  /** Raw failure reason from `useTranslationForPage`. `null` = render nothing. */
  error: string | null;
  /** Re-fires the pipeline. The banner doesn't auto-dismiss on retry — the
   *  parent owns dismissal so a fresh failure can re-surface it. */
  onRetry: () => void;
  /** Hides the banner until a new pipeline error fires. */
  onDismiss: () => void;
}

/**
 * `prettifyError` — maps the raw pipeline error string to a localized,
 * actionable hint. Pattern match is intentionally substring-based: the
 * pipeline aggregates errors from the native addon, the sidecar, and the
 * provider layer, so the underlying messages are heterogeneous and
 * sometimes wrapped (e.g. `Error: provider deepl: no-api-key`).
 *
 * Unknown errors fall through verbatim so debug detail isn't lost — the
 * raw string is still useful in a bug report.
 */
export function prettifyError(raw: string, t: (key: string) => string): string {
  const lower = raw.toLowerCase();

  if (lower.includes('no native build was found') || lower.includes('no native build')) {
    return t('reader.translation.error.noNativeAddon');
  }

  if (
    lower.includes('sidecar exited') ||
    lower.includes('sidecar offline') ||
    lower.includes('sidecar unhealthy') ||
    lower.includes('ocr sidecar')
  ) {
    return t('reader.translation.error.sidecarOffline');
  }

  if (lower.includes('no-api-key') || lower.includes('no api key')) {
    return t('reader.translation.error.noApiKey');
  }

  if (lower.includes('no healthy provider')) {
    return t('reader.translation.error.noHealthyProvider');
  }

  if (lower === 'disconnected') {
    return t('reader.translation.error.disconnected');
  }

  return raw;
}

/**
 * Slice G.6 — non-blocking, dismissible error banner that surfaces when the
 * translation pipeline fails for the active page. Sits below the chrome and
 * never covers the page image, so the reader can keep going untranslated
 * while the user decides whether to retry or dismiss.
 *
 * Visual identity matches the splash error treatment (bengara accent rule
 * + uppercase mono eyebrow) so the banner reads as part of the editorial
 * chrome rather than a generic alert toast. The body uses the friendly
 * mapping returned by `prettifyError`; the raw error is preserved in the
 * `title` attribute for power-users / bug reports.
 */
export function TranslationErrorBanner({
  error,
  onRetry,
  onDismiss,
}: TranslationErrorBannerProps) {
  const t = useT();

  if (!error) return null;

  const friendly = prettifyError(error, t);

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="translation-error-banner"
      title={error}
      className="pointer-events-auto flex w-full max-w-[min(640px,calc(100%-2rem))] items-start gap-4 border border-[var(--color-accent)]/60 border-l-2 border-l-[var(--color-accent)] bg-[var(--color-ink)]/90 px-4 py-3 backdrop-blur"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-accent)] uppercase">
          {t('reader.translation.failed')}
        </span>
        <p className="font-display text-[14px] leading-snug font-[360] text-foreground">
          <strong className="font-[460]">{t('reader.translation.banner.title')}</strong>{' '}
          <span className="text-[var(--color-bone-muted)]">{friendly}</span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          data-testid="translation-error-banner-retry"
          className="font-mono text-[11px] tracking-[0.18em] text-[var(--color-bone-muted)] underline-offset-4 uppercase transition-colors hover:text-foreground hover:underline"
        >
          {t('reader.translation.banner.retry')}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('reader.translation.banner.dismissAria')}
          data-testid="translation-error-banner-dismiss"
          className="flex h-7 w-7 items-center justify-center text-[var(--color-bone-faint)] transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5 stroke-[1.4]" />
        </button>
      </div>
    </div>
  );
}
