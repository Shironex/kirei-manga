import * as React from 'react';
import { Slot } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Actions are pills. Primary carries the cover accent and is used once per view;
 * secondary is the everyday control; ghost sits beside a primary; quiet is for
 * icon actions inside rows and toolbars; danger confirms a destructive choice.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-pill border border-transparent font-medium select-none',
    'transition-[background-color,border-color,color,transform] duration-base ease-expo active:scale-[0.98] active:duration-fast',
    'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-accent font-semibold text-on-accent hover:enabled:bg-[oklch(0.87_var(--accent-c)_var(--seed-h))]',
        secondary: 'bg-ink-2 text-fg-1 hover:enabled:bg-ink-3',
        ghost: 'border-line-strong bg-transparent text-fg-1 hover:enabled:bg-ink-2',
        quiet: 'bg-transparent text-fg-2 hover:enabled:bg-ink-2 hover:enabled:text-fg-1',
        danger: 'bg-err font-semibold text-ink-0 hover:enabled:bg-[oklch(0.77_0.15_25)]',
      },
      size: {
        md: 'h-10 px-[18px] text-md',
        sm: "h-8 px-3 text-sm [&_svg:not([class*='size-'])]:size-4",
        icon: 'size-10',
        'icon-sm': "size-8 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  }
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
