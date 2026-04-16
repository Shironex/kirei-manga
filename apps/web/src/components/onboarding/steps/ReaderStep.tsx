import { ChevronDown } from 'lucide-react';
import type { FitMode, ReaderDefaults, ReaderDirection, ReaderMode } from '@kireimanga/shared';
import { Segmented, type SegmentedOption } from '@/components/settings/Segmented';
import { SettingRow } from '@/components/settings/SettingsSection';
import { useT } from '@/hooks/useT';
import { useSettingsStore } from '@/stores/settings-store';
import { OnboardingStepFrame } from '../OnboardingStepFrame';
import { StepFooter } from '../StepFooter';

const DIRECTION_OPTIONS: ReadonlyArray<SegmentedOption<ReaderDirection>> = [
  { value: 'rtl', label: 'RTL' },
  { value: 'ltr', label: 'LTR' },
];

/**
 * Reader-feed language options. Mirrors the curated list used in
 * `ReaderDefaultsSection.tsx` so the onboarding choice and the Settings
 * dropdown stay in lockstep.
 */
const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語 (Japanese)' },
  { code: 'pl', label: 'Polski (Polish)' },
  { code: 'es', label: 'Español (Spanish)' },
  { code: 'es-la', label: 'Español (LATAM)' },
  { code: 'fr', label: 'Français (French)' },
  { code: 'de', label: 'Deutsch (German)' },
  { code: 'it', label: 'Italiano (Italian)' },
  { code: 'pt-br', label: 'Português (BR)' },
  { code: 'ru', label: 'Русский (Russian)' },
  { code: 'zh', label: '中文 (Chinese)' },
  { code: 'ko', label: '한국어 (Korean)' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'vi', label: 'Tiếng Việt (Vietnamese)' },
];

export function ReaderStep() {
  const t = useT();
  const reader = useSettingsStore(s => s.settings?.reader);

  if (!reader) return null;

  const patch = (partial: Partial<ReaderDefaults>) => {
    void useSettingsStore.getState().set({ reader: partial });
  };

  const MODE_OPTIONS: ReadonlyArray<SegmentedOption<ReaderMode>> = [
    { value: 'single', label: t('settings.reader.mode.single') },
    { value: 'double', label: t('settings.reader.mode.double') },
    { value: 'webtoon', label: t('settings.reader.mode.webtoon') },
  ];

  const FIT_OPTIONS: ReadonlyArray<SegmentedOption<FitMode>> = [
    { value: 'width', label: t('settings.reader.fit.width') },
    { value: 'height', label: t('settings.reader.fit.height') },
    { value: 'original', label: t('settings.reader.fit.original') },
  ];

  return (
    <OnboardingStepFrame
      kanji="読"
      eyebrow={t('onboarding.reader.eyebrow')}
      title={t('onboarding.reader.title')}
      description={t('onboarding.reader.description')}
      footer={<StepFooter />}
    >
      <SettingRow label={t('settings.reader.mode.label')} hint={t('settings.reader.mode.hint')}>
        <Segmented<ReaderMode>
          ariaLabel={t('settings.reader.mode.label')}
          value={reader.mode}
          options={MODE_OPTIONS}
          onChange={value => patch({ mode: value })}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.reader.direction.label')}
        hint={t('settings.reader.direction.hint')}
      >
        <Segmented<ReaderDirection>
          ariaLabel={t('settings.reader.direction.label')}
          value={reader.direction}
          options={DIRECTION_OPTIONS}
          onChange={value => patch({ direction: value })}
        />
      </SettingRow>

      <SettingRow label={t('settings.reader.fit.label')} hint={t('settings.reader.fit.hint')}>
        <Segmented<FitMode>
          ariaLabel={t('settings.reader.fit.label')}
          value={reader.fit}
          options={FIT_OPTIONS}
          onChange={value => patch({ fit: value })}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.reader.language.label')}
        hint={t('settings.reader.language.hint')}
      >
        <LanguageSelect value={reader.language} onChange={lang => patch({ language: lang })} />
      </SettingRow>
    </OnboardingStepFrame>
  );
}

function LanguageSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const hasValue = LANGUAGE_OPTIONS.some(o => o.code === value);
  const opts = hasValue ? LANGUAGE_OPTIONS : [...LANGUAGE_OPTIONS, { code: value, label: value }];
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-8 appearance-none rounded-sm border border-border bg-[var(--color-ink-sunken)] px-2.5 pr-7 font-mono text-[11px] tracking-[0.06em] text-foreground"
      >
        {opts.map(o => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute top-1/2 right-2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-bone-faint)]"
        aria-hidden
      />
    </div>
  );
}
