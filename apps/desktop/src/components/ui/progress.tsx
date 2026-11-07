import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const fillVariants = cva(
  'block h-full rounded-[inherit] transition-[width] duration-600 ease-expo',
  {
    variants: {
      tone: {
        accent: 'bg-accent',
        muted: 'bg-fg-3',
        error: 'bg-err',
      },
    },
    defaultVariants: { tone: 'accent' },
  }
);

type ProgressProps = Omit<React.ComponentProps<'div'>, 'role'> &
  VariantProps<typeof fillVariants> & {
    /** 0 to 1. */
    value: number;
    /** Accessible name, for example "Chapter 42 progress". */
    label: string;
    size?: 'thin' | 'md';
  };

/** Reading or download progress. Thin by default, like the prototype's tile bars. */
function Progress({ className, value, label, tone, size = 'thin', ...props }: ProgressProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className={cn(
        'overflow-hidden rounded-full bg-fg-1/10',
        size === 'thin' ? 'h-[3px]' : 'h-1',
        className
      )}
      {...props}
    >
      <i className={fillVariants({ tone })} style={{ width: `${pct}%` }} />
    </div>
  );
}

export { Progress };
