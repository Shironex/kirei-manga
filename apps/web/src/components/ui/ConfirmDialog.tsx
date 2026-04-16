import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/Button';

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
              <Button variant="subtle" disabled={busy}>
                {cancelLabel}
              </Button>
            </RadixDialog.Close>
            <Button
              variant={variant === 'danger' ? 'danger' : 'primary'}
              className="px-5"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy && busyLabel ? busyLabel : confirmLabel}
            </Button>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
