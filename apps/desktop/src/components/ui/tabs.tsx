import * as React from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/** Switches between sibling views. Horizontal by default; vertical for section lists. */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-6 data-[orientation=vertical]:flex-row', className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex gap-0.5 data-[orientation=vertical]:w-[200px] data-[orientation=vertical]:shrink-0 data-[orientation=vertical]:flex-col',
        className
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'rounded-lg px-3 py-2 text-left text-sm whitespace-nowrap text-fg-2',
        'transition-[background-color,color] duration-base ease-expo',
        'hover:bg-ink-2 hover:text-fg-1 data-[state=active]:bg-ink-2 data-[state=active]:text-fg-1',
        'disabled:cursor-not-allowed disabled:opacity-45',
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('min-w-0 flex-1 outline-none data-[state=active]:animate-enter', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
