import type { ReactNode } from 'react';

interface Props {
  kanji: string;
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}

/**
 * Generic Settings page section wrapper. Hairline divider on top, kanji glyph
 * + eyebrow + title to anchor the section, then a content slot for the
 * controls. Stack these vertically inside Settings.tsx.
 */
export function SettingsSection({ kanji, eyebrow, title, description, children }: Props) {
  return (
    <section className="flex flex-col gap-6 border-t border-border py-8 md:flex-row md:gap-12">
      <header className="flex w-full max-w-[280px] shrink-0 items-start gap-4">
        <span
          aria-hidden
          className="font-kanji flex h-9 w-9 shrink-0 items-center justify-center text-[20px] leading-none text-[var(--color-bone-faint)]"
        >
          {kanji}
        </span>
        <div>
          <span className="font-mono block text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
            {eyebrow}
          </span>
          <h2 className="font-display mt-1.5 text-[18px] leading-tight font-[380] tracking-[-0.008em] text-foreground">
            {title}
          </h2>
          {description && (
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-6">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}

/**
 * Single setting row: label + optional secondary hint on the left, control
 * on the right. Stacks below ~768px so segmented controls don't clip.
 */
export function SettingRow({ label, hint, children }: RowProps) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-6">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-muted)] uppercase">
          {label}
        </span>
        {hint && (
          <span className="text-[12px] text-[var(--color-bone-faint)]">{hint}</span>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
