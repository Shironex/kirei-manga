import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/hooks/useT';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function listFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(el => {
    if (el.hasAttribute('disabled')) return false;
    if (el.getAttribute('aria-hidden') === 'true') return false;
    // Skip nodes inside `display:none`/`visibility:hidden` subtrees.
    return el.offsetParent !== null || el === document.activeElement;
  });
}

/**
 * Right-docked drawer with a scrim backdrop. Implements a lightweight
 * focus trap (Tab/Shift+Tab cycle within the panel; focus restored to
 * the previously-active element on close), Escape-to-close, and a real
 * close button in-panel. The scrim is a `<div>` — not a `<button>` — so
 * screen readers don't announce it as an interactive element; click
 * still closes, and the heading/close button carry the real affordances.
 */
export function Drawer({ open, onClose, title, eyebrow, children, footer }: DrawerProps) {
  const t = useT();
  const panelRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = listFocusable(panel);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
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

  // Save + restore focus around the open lifecycle. Focus the first
  // focusable inside the panel once it mounts; on close, return focus
  // to whatever held it before open (e.g. the trigger button).
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    // rAF so refs are populated and the panel is painted before we
    // query focusables — otherwise `offsetParent` checks can miss.
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = listFocusable(panel);
      (focusables[0] ?? panel).focus();
    });
    return () => {
      cancelAnimationFrame(raf);
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-[var(--color-ink)]/70 backdrop-blur-sm"
      />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="animate-fade-up relative flex h-full w-[min(420px,100vw)] flex-col border-l border-[var(--color-rule-strong)] bg-[var(--color-ink)] shadow-2xl outline-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-rule)] px-8 py-6">
          <div className="flex min-w-0 flex-col gap-2">
            {eyebrow && (
              <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
                {eyebrow}
              </span>
            )}
            <h2
              id={titleId}
              className="font-display text-[22px] leading-snug font-[360] tracking-[-0.01em] text-foreground"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="-mt-1 -mr-2 shrink-0 p-2 text-[var(--color-bone-muted)] transition-colors hover:text-foreground focus:text-foreground focus:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-8 py-6">{children}</div>
        {footer && (
          <footer className="border-t border-[var(--color-rule)] px-8 py-5">{footer}</footer>
        )}
      </aside>
    </div>
  );
}
