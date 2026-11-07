import * as React from 'react';
import { Tooltip as TooltipPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/** One provider at the app root keeps the delay shared between tooltips. */
function TooltipProvider({
  delayDuration = 400,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip"
        sideOffset={sideOffset}
        className={cn(
          'z-50 flex items-center gap-2 rounded-lg bg-fg-1 px-2.5 py-1.5 text-xs font-medium text-ink-0',
          'shadow-[0_12px_30px_-12px_oklch(0_0_0/0.7)] animate-pop',
          className
        )}
        {...props}
      >
        {children}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

/** Keyboard shortcut hint, for tooltips and menus. */
function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-grid h-[18px] min-w-[18px] place-items-center rounded-[4px] border border-current/25 px-1 font-mono text-[11px] leading-none font-medium opacity-80',
        className
      )}
      {...props}
    />
  );
}

export { Kbd, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
