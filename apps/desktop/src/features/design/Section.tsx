import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

export function Section({
  id,
  title,
  lead,
  children,
}: {
  id: string;
  title: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={`ds-${id}`} className="mb-20 scroll-mt-20">
      <h2 className="m-0 mb-2 font-display text-3xl font-[650] font-condensed">{title}</h2>
      {lead && <p className="m-0 mb-6 max-w-[64ch] text-fg-2">{lead}</p>}
      {children}
    </section>
  );
}

/** A labelled row of specimens inside a section. */
export function Specimen({
  label,
  note,
  children,
  className,
}: {
  label: string;
  note?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-6 border-t border-line py-6">
      <div>
        <h3 className="m-0 text-md font-semibold">{label}</h3>
        {note && <p className="m-0 mt-1 text-xs text-fg-3">{note}</p>}
      </div>
      <div className={cn('flex min-w-0 flex-wrap items-center gap-3', className)}>{children}</div>
    </div>
  );
}

export function Caption({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] text-fg-3">{children}</span>;
}
