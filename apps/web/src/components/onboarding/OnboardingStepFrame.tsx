import type { ReactNode } from 'react';

interface Props {
  kanji: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Footer slot — usually [Back] [Skip step] [Next] or step-specific actions. */
  footer?: ReactNode;
}

/**
 * Shared chrome for every onboarding step: kanji glyph + serif headline +
 * narrative subtitle, then a content well, then a footer rail with the
 * step actions. Mirrors the Settings page's section header treatment so
 * the visual language is continuous when the user lands in Settings later.
 */
export function OnboardingStepFrame({
  kanji,
  eyebrow,
  title,
  description,
  children,
  footer,
}: Props) {
  return (
    <div className="animate-fade-up flex w-full flex-col gap-10">
      <header className="flex items-start gap-5">
        <span
          aria-hidden
          className="font-kanji flex h-12 w-12 shrink-0 items-center justify-center text-[28px] leading-none text-[var(--color-bone-faint)]"
        >
          {kanji}
        </span>
        <div className="flex flex-col gap-2">
          <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-accent)] uppercase">
            {eyebrow}
          </span>
          <h2 className="font-display text-[26px] leading-[1.1] font-[380] tracking-[-0.012em] text-foreground sm:text-[30px]">
            {title}
          </h2>
          {description && (
            <p className="mt-1 max-w-[58ch] text-[14px] leading-relaxed text-[var(--color-bone-muted)]">
              {description}
            </p>
          )}
        </div>
      </header>

      {children && <div className="flex flex-col gap-8">{children}</div>}

      {footer && (
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
          {footer}
        </div>
      )}
    </div>
  );
}
