import { useEffect, type ReactNode } from 'react';
import { useT } from '@/hooks/useT';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Right-docked drawer with a scrim backdrop. Kept minimal on purpose —
 * no focus trap, no animation library, no portal. Esc + click-outside
 * close it, the backdrop blurs the page under without dimming so the
 * editorial palette stays legible. Consumers control open state; the
 * drawer only handles its own chrome.
 */
export function Drawer({ open, onClose, title, eyebrow, children, footer }: DrawerProps) {
  const t = useT();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Lock body scroll while the drawer is open so scrolling stays within
  // the editor — matches the reader's body-scroll lock.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label={t('common.windowControls.close')}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-ink)]/70 backdrop-blur-sm"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-fade-up relative flex h-full w-[min(420px,100vw)] flex-col border-l border-[var(--color-rule-strong)] bg-[var(--color-ink)] shadow-2xl"
      >
        <header className="flex flex-col gap-2 border-b border-[var(--color-rule)] px-8 py-6">
          {eyebrow && (
            <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
              {eyebrow}
            </span>
          )}
          <h2 className="font-display text-[22px] leading-snug font-[360] tracking-[-0.01em] text-foreground">
            {title}
          </h2>
        </header>
        <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
        {footer && (
          <footer className="border-t border-[var(--color-rule)] px-8 py-5">{footer}</footer>
        )}
      </aside>
    </div>
  );
}
