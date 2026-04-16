import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  leadingIcon?: ReactNode;
}

export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { active = false, leadingIcon, disabled, className, children, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled}
      className={cn(
        'relative mr-5 px-0 py-1.5 text-[12.5px] tracking-wide transition-colors last:mr-0',
        disabled && 'pointer-events-none opacity-50',
        active ? 'text-foreground' : 'text-[var(--color-bone-muted)] hover:text-foreground',
        className
      )}
      {...rest}
    >
      {leadingIcon ? <span className="mr-1.5 inline-flex align-baseline">{leadingIcon}</span> : null}
      <span>{children}</span>
      {active && (
        <span
          aria-hidden
          className="absolute right-0 -bottom-px left-0 block h-px bg-[var(--color-accent)]"
        />
      )}
    </button>
  );
});
