import type { ReactNode } from 'react';

type Props = {
  eyebrow: string;
  kanji: string;
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, kanji, title, subtitle, actions }: Props) {
  return (
    <header className="animate-fade-up relative mb-[clamp(2rem,4vh,3.5rem)] flex items-end justify-between gap-8 pb-6">
      <div className="flex-1">
        <div className="mb-5 flex items-center gap-3">
          <span
            className="font-kanji text-[13px] leading-none text-[var(--color-accent)]"
            aria-hidden
          >
            {kanji}
          </span>
          <span className="block h-px w-6 bg-[var(--color-rule-strong)]" />
          <span className="font-mono text-[10px] tracking-[0.26em] text-[var(--color-bone-faint)] uppercase">
            {eyebrow}
          </span>
        </div>
        <h1 className="font-display text-[clamp(2.25rem,4.5vw,3.5rem)] leading-[1.02] font-[350] tracking-[-0.022em] text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-4 max-w-[56ch] text-[14px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0 pb-2">{actions}</div>}
    </header>
  );
}
