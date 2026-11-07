import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/** Binary setting that applies at once. Pair it with a visible label. */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-6 w-10 shrink-0 items-center rounded-pill border border-line-strong bg-ink-3 px-[3px]',
        'transition-[background-color,border-color] duration-base ease-expo',
        'data-[state=checked]:border-transparent data-[state=checked]:bg-accent',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'pointer-events-none block size-4 rounded-full bg-fg-2',
          'transition-[transform,background-color] duration-base ease-expo',
          'data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-on-accent'
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
