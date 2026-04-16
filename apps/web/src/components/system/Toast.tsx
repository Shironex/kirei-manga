import { useEffect, useRef } from 'react';
import { useToastStore, type Toast as ToastModel } from '@/stores/toast-store';
import { useT } from '@/hooks/useT';

const EYEBROW_KEY: Record<ToastModel['variant'], string> = {
  error: 'toast.eyebrow.error',
  info: 'toast.eyebrow.notice',
  success: 'toast.eyebrow.done',
};

interface ToastProps {
  toast: ToastModel;
}

export function Toast({ toast }: ToastProps) {
  const t = useT();
  const dismiss = useToastStore(s => s.dismiss);
  const handle = useRef<number | null>(null);
  const remaining = useRef<number>(toast.ttlMs);
  const startedAt = useRef<number>(Date.now());

  const pause = (): void => {
    if (handle.current == null) return;
    window.clearTimeout(handle.current);
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    handle.current = null;
  };

  const start = (): void => {
    if (handle.current != null) return;
    startedAt.current = Date.now();
    handle.current = window.setTimeout(() => dismiss(toast.id), remaining.current);
  };

  useEffect(() => {
    start();
    return () => {
      if (handle.current != null) {
        window.clearTimeout(handle.current);
        handle.current = null;
      }
    };
  }, []);

  const isError = toast.variant === 'error';
  const borderLeft = isError
    ? 'border-l-[var(--color-accent)]'
    : 'border-l-[var(--color-rule-strong)]';
  const eyebrowColor = isError ? 'text-[var(--color-accent)]' : 'text-[var(--color-bone-faint)]';
  const bodyColor = toast.variant === 'info' ? 'text-muted-foreground' : 'text-foreground';

  return (
    <li
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      onMouseEnter={pause}
      onMouseLeave={start}
      onFocus={pause}
      onBlur={start}
      className={`relative animate-fade-up overflow-hidden rounded-[2px] border border-border border-l-2 bg-[var(--color-ink-raised)] py-3 pr-3 pl-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] ${borderLeft}`}
    >
      <p className={`font-mono text-[10px] tracking-[0.24em] uppercase ${eyebrowColor}`}>
        {t(EYEBROW_KEY[toast.variant])}
      </p>
      {toast.title ? (
        <p className="font-display mt-1 text-[14px] font-[360]">{toast.title}</p>
      ) : null}
      <p className={`mt-1 text-[13px] leading-relaxed ${bodyColor}`}>{toast.body}</p>
      {isError ? (
        <button
          type="button"
          onClick={() => dismiss(toast.id)}
          aria-label={t('toast.dismiss')}
          className="absolute top-2 right-2 font-mono text-[11px] text-[var(--color-bone-faint)] hover:text-foreground"
        >
          ×
        </button>
      ) : null}
    </li>
  );
}
