import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

type Variant = 'default' | 'danger';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  eyebrow?: string;
  variant?: Variant;
  busy?: boolean;
  busyLabel?: string;
}

/**
 * Editorial confirm dialog — shadcn-style Radix primitive dressed in the
 * ink-and-paper palette. Use for destructive or otherwise non-reversible
 * actions where the native browser confirm would break the aesthetic.
 * Caller owns the open state and the confirm action; the dialog just
 * renders chrome + button row.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  eyebrow,
  variant = 'default',
  busy = false,
  busyLabel,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === 'danger'
      ? 'inline-flex h-9 items-center rounded-[2px] border border-[var(--color-accent)] bg-[var(--color-accent)] px-5 font-mono text-[11px] tracking-[0.22em] text-[var(--color-accent-foreground)] uppercase transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60'
      : 'inline-flex h-9 items-center rounded-[2px] border border-border px-5 font-mono text-[11px] tracking-[0.22em] text-foreground uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-wait disabled:opacity-60';

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-50 bg-[var(--color-ink)]/70 backdrop-blur-sm data-[state=open]:animate-fade-up" />
        <RadixDialog.Content
          onOpenAutoFocus={e => e.preventDefault()}
          className="animate-fade-up fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-[var(--color-rule-strong)] bg-[var(--color-ink)] shadow-2xl"
        >
          <div className="flex flex-col gap-2 border-b border-[var(--color-rule)] px-8 py-6">
            {eyebrow && (
              <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
                {eyebrow}
              </span>
            )}
            <RadixDialog.Title className="font-display text-[22px] leading-snug font-[360] tracking-[-0.01em] text-foreground">
              {title}
            </RadixDialog.Title>
          </div>
          <RadixDialog.Description asChild>
            <div className="px-8 py-6 text-[14px] leading-relaxed text-[var(--color-bone-muted)]">
              {description}
            </div>
          </RadixDialog.Description>
          <div className="flex items-center justify-end gap-3 border-t border-[var(--color-rule)] px-8 py-5">
            <RadixDialog.Close asChild>
              <button
                type="button"
                disabled={busy}
                className="inline-flex h-9 items-center rounded-[2px] border border-border px-4 font-mono text-[11px] tracking-[0.22em] text-[var(--color-bone-muted)] uppercase transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-wait disabled:opacity-60"
              >
                {cancelLabel}
              </button>
            </RadixDialog.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className={confirmClass}
            >
              {busy && busyLabel ? busyLabel : confirmLabel}
            </button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
