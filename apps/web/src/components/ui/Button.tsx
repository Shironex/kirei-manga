import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'subtle' | 'ghost' | 'accent' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

const base =
  'inline-flex items-center rounded-[2px] font-mono tracking-[0.22em] uppercase disabled:cursor-wait disabled:opacity-60';

const sizes: Record<ButtonSize, string> = {
  sm: 'h-7 px-3 text-[10.5px]',
  md: 'h-9 px-4 text-[11px]',
};

const variants: Record<ButtonVariant, string> = {
  primary:
    'border border-border text-foreground transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
  subtle:
    'border border-border text-[var(--color-bone-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]',
  ghost:
    'text-[var(--color-bone-muted)] transition-colors hover:text-foreground',
  accent:
    'border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-foreground)] transition-opacity hover:opacity-90',
  danger:
    'border border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-foreground)] transition-opacity hover:opacity-90',
};

export function buttonClass({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, sizes[size], variants[variant], className);
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leadingIcon, trailingIcon, className, children, type, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(base, sizes[size], variants[variant], className)}
      {...rest}
    >
      {leadingIcon ? <span className="mr-2 inline-flex">{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span className="ml-2 inline-flex">{trailingIcon}</span> : null}
    </button>
  );
});
