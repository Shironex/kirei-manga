import * as React from 'react';

import { cn } from '@/lib/utils';

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & {
  /** Leading icon, for search fields. Decorative: label the input itself. */
  icon?: React.ReactNode;
  invalid?: boolean;
  /** `sm` is 38 px, the height of the segmented control in toolbars. */
  size?: 'md' | 'sm';
};

function Input({ className, icon, invalid, size = 'md', ...props }: InputProps) {
  return (
    <div data-slot="input" className={cn('relative flex items-center', className)}>
      {icon && (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute text-fg-3',
            size === 'sm' ? 'left-3 [&_svg]:size-4' : 'left-3.5 [&_svg]:size-[18px]'
          )}
        >
          {icon}
        </span>
      )}
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          'w-full rounded-pill border border-line-strong bg-ink-1 text-fg-1 placeholder:text-fg-3',
          size === 'sm' ? 'h-[38px] px-3 text-sm' : 'h-11 px-4',
          'transition-[border-color,box-shadow] duration-base ease-expo',
          'focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-wash)] focus:outline-none focus-visible:outline-none',
          'aria-invalid:border-err aria-invalid:focus:shadow-[0_0_0_3px_oklch(0.72_0.16_25/0.2)]',
          'disabled:cursor-not-allowed disabled:opacity-45',
          icon && (size === 'sm' ? 'pl-[34px]' : 'pl-[42px]')
        )}
        {...props}
      />
    </div>
  );
}

export { Input };
