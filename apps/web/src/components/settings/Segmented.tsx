import type { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional aria-label override (defaults to the label string). */
  aria?: string;
}

interface Props<T extends string> {
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (next: T) => void;
  /** Visible label for the group — surfaces on screen-reader as `aria-label`. */
  ariaLabel: string;
}

/**
 * Hairline segmented control. Active segment carries a thin bengara underline
 * (matches the design system's editorial accent treatment) and bumps the
 * label to full foreground; inactive labels stay muted.
 */
export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: Props<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex flex-wrap items-stretch gap-x-5 gap-y-1"
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.aria ?? (typeof opt.label === 'string' ? opt.label : undefined)}
            onClick={() => onChange(opt.value)}
            className={[
              'group relative cursor-pointer pb-1 font-mono text-[11px] tracking-[0.18em] uppercase transition-colors',
              active
                ? 'text-foreground'
                : 'text-[var(--color-bone-faint)] hover:text-[var(--color-bone-muted)]',
            ].join(' ')}
          >
            {opt.label}
            <span
              aria-hidden
              className={[
                'absolute -bottom-px left-0 h-px transition-all',
                active
                  ? 'w-full bg-[var(--color-accent)]'
                  : 'w-0 bg-[var(--color-bone-faint)] group-hover:w-full',
              ].join(' ')}
            />
          </button>
        );
      })}
    </div>
  );
}
