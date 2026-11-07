import * as React from 'react';
import { Toggle } from 'radix-ui';

import { cn } from '@/lib/utils';

const chipClass = [
  'inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-chip border border-line-strong bg-transparent px-3 text-sm text-fg-2',
  'transition-[background-color,border-color,color] duration-base ease-expo',
  'hover:border-fg-3 hover:text-fg-1',
  'data-[state=on]:border-accent/50 data-[state=on]:bg-accent-wash data-[state=on]:text-fg-1',
  'disabled:cursor-not-allowed disabled:opacity-45',
  "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-3.5",
];

/** Filter or tag that toggles on and off (source, genre, status). */
function Chip({ className, ...props }: React.ComponentProps<typeof Toggle.Root>) {
  return <Toggle.Root data-slot="chip" className={cn(chipClass, className)} {...props} />;
}

/** Static label (genre, status) that is not interactive. */
function Tag({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="tag"
      className={cn(
        'inline-flex h-[26px] items-center rounded-chip bg-fg-1/6 px-2.5 text-xs font-medium text-fg-2',
        className
      )}
      {...props}
    />
  );
}

export { Chip, Tag };
