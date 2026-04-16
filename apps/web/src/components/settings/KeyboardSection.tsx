import { useT } from '@/hooks/useT';
import { SettingsSection } from './SettingsSection';

interface Shortcut {
  /** i18n key for the action label. */
  actionKey: string;
  keys: ReadonlyArray<string>;
  /** Optional i18n key for a plain-language hint shown beneath the binding. */
  hintKey?: string;
}

/**
 * Read-only mirror of the bindings hardcoded in `useReaderKeyboard`. Custom
 * rebinding lands post-v0.1; until then this table documents what's wired.
 */
const SHORTCUTS: ReadonlyArray<Shortcut> = [
  {
    actionKey: 'settings.keyboard.action.nextPage',
    keys: ['→', 'D', 'Space', 'Enter'],
    hintKey: 'settings.keyboard.hint.rtlInverted',
  },
  {
    actionKey: 'settings.keyboard.action.prevPage',
    keys: ['←', 'A', 'Shift+Space'],
    hintKey: 'settings.keyboard.hint.rtlInverted',
  },
  { actionKey: 'settings.keyboard.action.firstPage', keys: ['Home'] },
  { actionKey: 'settings.keyboard.action.lastPage', keys: ['End'] },
  { actionKey: 'settings.keyboard.action.fullscreen', keys: ['F'] },
  { actionKey: 'settings.keyboard.action.fitWidth', keys: ['1'] },
  { actionKey: 'settings.keyboard.action.fitHeight', keys: ['2'] },
  { actionKey: 'settings.keyboard.action.fitOriginal', keys: ['3'] },
  { actionKey: 'settings.keyboard.action.bookmark', keys: ['B'] },
];

export function KeyboardSection() {
  const t = useT();
  return (
    <SettingsSection
      kanji="鍵"
      eyebrow={t('settings.section.shortcuts')}
      title={t('settings.keyboard.title')}
      description={t('settings.keyboard.description')}
    >
      <div className="-mt-2 mb-1 self-start">
        <span className="font-mono text-[10px] tracking-[0.24em] text-[var(--color-bone-faint)] uppercase">
          {t('settings.keyboard.comingSoon')}
        </span>
      </div>

      <div className="flex flex-col">
        {SHORTCUTS.map(s => {
          const action = t(s.actionKey);
          return (
            <div
              key={s.actionKey}
              className="grid grid-cols-1 items-baseline gap-1 border-b border-border py-3 last:border-b-0 md:grid-cols-[1fr_auto] md:gap-6"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{action}</span>
                {s.hintKey && (
                  <span className="text-[11px] text-[var(--color-bone-faint)]">
                    {t(s.hintKey)}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {s.keys.map((k, i) => (
                  <span key={`${s.actionKey}-${k}-${i}`} className="flex items-center gap-1.5">
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
          );
        })}
      </div>
    </SettingsSection>
  );
}
