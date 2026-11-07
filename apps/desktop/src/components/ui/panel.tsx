import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

/**
 * Grouped surface. Solid is the default; glass is reserved for reader chrome and
 * panels that float over artwork, and falls back to solid ink with reduced
 * transparency or the glass setting off.
 */
const panelVariants = cva('rounded-panel', {
  variants: {
    tone: {
      solid: 'border border-line bg-ink-1',
      raised: 'border border-line bg-ink-2',
      glass: 'glass',
    },
    padding: {
      none: '',
      sm: 'p-3',
      md: 'p-6',
    },
  },
  defaultVariants: { tone: 'solid', padding: 'md' },
});

type PanelProps = React.ComponentProps<'div'> & VariantProps<typeof panelVariants>;

function Panel({ className, tone, padding, ...props }: PanelProps) {
  return (
    <div
      data-slot="panel"
      data-tone={tone ?? 'solid'}
      className={cn(panelVariants({ tone, padding }), className)}
      {...props}
    />
  );
}

export { Panel, panelVariants };
