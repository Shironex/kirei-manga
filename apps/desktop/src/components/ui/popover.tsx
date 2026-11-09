import * as React from 'react';
import { Popover as PopoverPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

/**
 * A small floating panel anchored to its trigger (pickers, quick edits).
 * Solid like the select menu, so it reads over covers; Esc and a click
 * outside close it, and focus returns to the trigger.
 */
function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-[280px] max-w-[calc(100vw-32px)] rounded-xl border border-line-strong bg-ink-1 p-1.5 text-fg-1 outline-none',
          'shadow-[0_24px_50px_-20px_oklch(0_0_0/0.8)] animate-pop',
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
