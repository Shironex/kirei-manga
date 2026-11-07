import type { ReactElement, ReactNode } from 'react';

import { Kbd, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** A control with a tooltip naming it and its key. */
export function Tip({
  label,
  keys,
  side = 'bottom',
  children,
}: {
  label: ReactNode;
  keys?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>
        {label}
        {keys && <Kbd>{keys}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
