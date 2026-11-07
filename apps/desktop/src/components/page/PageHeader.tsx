import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Page title and lead. The title takes focus after navigation (tabIndex -1), so
 * screen readers announce the new page and Tab continues from the top of it.
 */
export function PageHeader({
  title,
  lead,
  actions,
  className,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${title} - KireiManga`;
    // Only move focus when it was left on the body or in the rail (a navigation),
    // never away from a control on the page.
    const active = document.activeElement;
    if (!active || active === document.body || active.closest('[data-shell-rail]')) {
      ref.current?.focus({ preventScroll: true });
    }
  }, [title]);

  return (
    <header className={cn('mb-8 flex flex-wrap items-end gap-x-8 gap-y-4', className)}>
      <div className="min-w-0 flex-1">
        <h1
          ref={ref}
          tabIndex={-1}
          className="m-0 mb-2 font-display text-4xl font-bold tracking-[-0.01em] outline-none [font-variation-settings:'wdth'_80,'opsz'_72]"
        >
          {title}
        </h1>
        {lead && <p className="m-0 max-w-[62ch] text-fg-2">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
