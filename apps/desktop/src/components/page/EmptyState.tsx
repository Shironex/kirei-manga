import type { ReactNode } from 'react';

import kireiFull from '@/assets/kirei/full.webp';
import { cn } from '@/lib/utils';

/**
 * What a screen shows before it has content: Kirei, one line on what belongs
 * here, and how to get it. The mascot is an accent, so she stays small.
 */
export function EmptyState({
  title,
  children,
  actions,
  className,
  tone = 'calm',
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  /** "alert" marks an error so assistive tech announces it. */
  tone?: 'calm' | 'alert';
}) {
  return (
    <div
      role={tone === 'alert' ? 'alert' : undefined}
      className={cn(
        'grid max-w-[600px] grid-cols-[96px_minmax(0,1fr)] items-center gap-6 py-8',
        className
      )}
    >
      <img src={kireiFull} alt="" draggable={false} className="w-24 select-none" />
      <div>
        <h2 className="m-0 mb-1.5 font-display text-xl font-[650] font-condensed">{title}</h2>
        <div className="m-0 mb-4 text-fg-2 [&_p]:m-0">{children}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
