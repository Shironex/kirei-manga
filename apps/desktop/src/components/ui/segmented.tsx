import * as React from 'react';
import { ToggleGroup } from 'radix-ui';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * One choice out of a few (reader mode, direction, strength). The selected
 * segment inverts to the brightest ink, so it reads without relying on the accent.
 */
const itemVariants = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-pill font-medium text-fg-2',
    'transition-[background-color,color] duration-base ease-expo',
    'hover:text-fg-1 data-[state=on]:bg-fg-1 data-[state=on]:text-ink-0',
    'disabled:cursor-not-allowed disabled:opacity-45',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      size: {
        md: 'h-[30px] px-3.5 text-sm',
        sm: 'h-6 px-2.5 text-xs',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

const SegmentedSize = React.createContext<VariantProps<typeof itemVariants>['size']>('md');

type SegmentedProps = Omit<
  React.ComponentProps<typeof ToggleGroup.Root>,
  'type' | 'value' | 'defaultValue' | 'onValueChange'
> &
  VariantProps<typeof itemVariants> & {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
  };

function Segmented({ className, size, onValueChange, ...props }: SegmentedProps) {
  return (
    <SegmentedSize.Provider value={size}>
      <ToggleGroup.Root
        data-slot="segmented"
        type="single"
        // A segmented control always has a value: ignore clicks on the active segment.
        onValueChange={next => next && onValueChange?.(next)}
        className={cn(
          'inline-flex gap-0.5 rounded-pill border border-line bg-ink-2 p-[3px]',
          className
        )}
        {...props}
      />
    </SegmentedSize.Provider>
  );
}

function SegmentedItem({ className, ...props }: React.ComponentProps<typeof ToggleGroup.Item>) {
  const size = React.useContext(SegmentedSize);
  return (
    <ToggleGroup.Item
      data-slot="segmented-item"
      className={cn(itemVariants({ size }), className)}
      {...props}
    />
  );
}

export { Segmented, SegmentedItem };
