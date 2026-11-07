import * as React from 'react';

import { cn } from '@/lib/utils';

type InputProps = React.ComponentProps<'input'> & {
  /** Leading icon, for search fields. Decorative: label the input itself. */
  icon?: React.ReactNode;
  invalid?: boolean;
};

function Input({ className, icon, invalid, ...props }: InputProps) {
  return (
    <div data-slot="input" className={cn('relative flex items-center', className)}>
      {icon && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-3.5 text-fg-3 [&_svg]:size-[18px]"
        >
          {icon}
        </span>
      )}
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          'h-11 w-full rounded-pill border border-line-strong bg-ink-1 px-4 text-fg-1 placeholder:text-fg-3',
          'transition-[border-color,box-shadow] duration-base ease-expo',
          'focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-wash)] focus:outline-none focus-visible:outline-none',
          'aria-invalid:border-err aria-invalid:focus:shadow-[0_0_0_3px_oklch(0.72_0.16_25/0.2)]',
          'disabled:cursor-not-allowed disabled:opacity-45',
          icon && 'pl-[42px]'
        )}
        {...props}
      />
    </div>
  );
}

export { Input };
