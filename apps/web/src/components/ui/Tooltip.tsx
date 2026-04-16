import * as RadixTooltip from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

interface TooltipProps {
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  delayDuration?: number;
  children: ReactNode;
}

export function Tooltip({
  content,
  side = 'right',
  align = 'center',
  sideOffset = 8,
  delayDuration,
  children,
}: TooltipProps) {
  return (
    <RadixTooltip.Root delayDuration={delayDuration}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          align={align}
          sideOffset={sideOffset}
          className="animate-fade-up z-50 rounded-[2px] border border-[var(--color-rule-strong)] bg-[var(--color-ink-sunken)] px-2.5 py-1 font-mono text-[10px] tracking-[0.2em] text-foreground uppercase select-none"
        >
          {content}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export const TooltipProvider = RadixTooltip.Provider;
