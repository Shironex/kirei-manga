import { SettingsSection } from './SettingsSection';

interface Shortcut {
  action: string;
  keys: ReadonlyArray<string>;
  /** Plain-language hint shown beneath the binding row. */
  hint?: string;
}

/**
 * Read-only mirror of the bindings hardcoded in `useReaderKeyboard`. Custom
 * rebinding lands post-v0.1; until then this table documents what's wired.
 */
const SHORTCUTS: ReadonlyArray<Shortcut> = [
  { action: 'Next page', keys: ['→', 'D', 'Space', 'Enter'], hint: 'Inverted in RTL.' },
  { action: 'Previous page', keys: ['←', 'A', 'Shift+Space'], hint: 'Inverted in RTL.' },
  { action: 'First page', keys: ['Home'] },
  { action: 'Last page', keys: ['End'] },
  { action: 'Toggle fullscreen', keys: ['F'] },
  { action: 'Fit to width', keys: ['1'] },
  { action: 'Fit to height', keys: ['2'] },
  { action: 'Fit original', keys: ['3'] },
  { action: 'Toggle bookmark', keys: ['B'] },
];

export function KeyboardSection() {
  return (
    <SettingsSection
      kanji="鍵"
      eyebrow="Shortcuts"
      title="Keyboard"
      description="Reader keyboard bindings. Rebinding is parked until after v0.1."
    >
      <div className="-mt-2 mb-1 self-start">
        <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
          Coming soon — rebinding
        </span>
      </div>

      <div className="flex flex-col">
        {SHORTCUTS.map(s => (
          <div
            key={s.action}
            className="grid grid-cols-1 items-baseline gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:gap-6"
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] text-foreground">{s.action}</span>
              {s.hint && (
                <span className="text-[11px] text-[var(--color-bone-faint)]">{s.hint}</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {s.keys.map((k, i) => (
                <span key={`${s.action}-${k}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <span
                      aria-hidden
                      className="font-mono text-[10px] text-[var(--color-bone-faint)]"
                    >
                      ·
                    </span>
                  )}
                  <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded-sm border border-border bg-[var(--color-ink-sunken)] px-1.5 font-mono text-[10px] tracking-[0.06em] text-[var(--color-bone-muted)]">
                    {k}
                  </kbd>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SettingsSection>
  );
}
