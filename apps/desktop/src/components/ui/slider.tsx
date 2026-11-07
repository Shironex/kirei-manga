import * as React from 'react';
import { Slider as SliderPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

/** Continuous value (brightness, contrast). A thumb per value; one by default. */
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = (value ?? defaultValue ?? [min]).length;
  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex h-6 w-full touch-none items-center select-none',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 grow overflow-hidden rounded-full bg-ink-3">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, i) => (
        <SliderPrimitive.Thumb
          key={i}
          className={cn(
            'block size-4 rounded-full bg-fg-1 shadow-[0_0_0_4px_oklch(0_0_0/0.25)]',
            'transition-transform duration-fast ease-expo hover:scale-110 active:scale-95',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'
          )}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
