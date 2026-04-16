import type { ReactNode } from 'react';

type Props = {
  glyph: string;
  title: string;
  body: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({ glyph, title, body, hint, action }: Props) {
  return (
    <div className="animate-fade-up paper-grain relative flex flex-1 items-center">
      <div className="relative flex w-full items-center gap-[clamp(2rem,6vw,5rem)] py-16 pr-12 pl-2">
        <div className="relative flex h-[180px] w-[120px] shrink-0 items-center justify-center">
          <span
            aria-hidden
            className="absolute inset-0 rounded-sm border border-[var(--color-rule)] bg-[var(--color-ink-raised)]"
          />
          <span
            aria-hidden
            className="absolute top-3 right-3 bottom-3 left-3 border border-dashed border-[var(--color-rule)]"
          />
          <span className="font-kanji relative text-[64px] leading-none text-[var(--color-accent)] opacity-90">
            {glyph}
          </span>
        </div>
        <div className="max-w-[44ch]">
          <h2 className="font-display text-[22px] leading-snug font-[350] tracking-[-0.01em] text-foreground">
            {title}
          </h2>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">{body}</p>
          {action && <div className="mt-6">{action}</div>}
          {hint && (
            <p className="mt-6 font-mono text-[10.5px] tracking-[0.22em] text-[var(--color-bone-faint)] uppercase">
              {hint}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
