import type {
  AppearanceSettings,
  CardSize,
  FontSize,
  Language,
  ReadingFont,
  Theme,
} from '@kireimanga/shared';
import { useSettingsStore } from '@/stores/settings-store';
import { useT } from '@/hooks/useT';
import { Segmented, type SegmentedOption } from './Segmented';
import { SettingRow, SettingsSection } from './SettingsSection';

const THEME_OPTIONS: ReadonlyArray<SegmentedOption<Theme>> = [
  { value: 'sumi', label: 'Sumi' },
  { value: 'washi', label: 'Washi' },
];

const FONT_SIZE_OPTIONS: ReadonlyArray<SegmentedOption<FontSize>> = [
  { value: 'xs', label: 'XS' },
  { value: 'sm', label: 'SM' },
  { value: 'md', label: 'MD' },
  { value: 'lg', label: 'LG' },
  { value: 'xl', label: 'XL' },
];

const READING_FONT_OPTIONS: ReadonlyArray<SegmentedOption<ReadingFont>> = [
  { value: 'fraunces', label: 'Fraunces' },
  { value: 'mincho', label: 'Mincho' },
  { value: 'serif', label: 'Serif' },
  { value: 'sans', label: 'Sans' },
];

export function AppearanceSection() {
  const t = useT();
  const appearance = useSettingsStore(s => s.settings?.appearance);
  const language = useSettingsStore(s => s.settings?.language);
  if (!appearance || !language) return null;

  const patch = (partial: Partial<AppearanceSettings>) => {
    void useSettingsStore.getState().set({ appearance: partial });
  };

  const setLanguage = (next: Language) => {
    void useSettingsStore.getState().set({ language: next });
  };

  const LANGUAGE_OPTIONS: ReadonlyArray<SegmentedOption<Language>> = [
    { value: 'en', label: t('settings.language.option.en') },
    { value: 'pl', label: t('settings.language.option.pl') },
  ];

  const CARD_SIZE_OPTIONS: ReadonlyArray<SegmentedOption<CardSize>> = [
    { value: 'compact', label: t('settings.appearance.cardSize.compact') },
    { value: 'cozy', label: t('settings.appearance.cardSize.cozy') },
    { value: 'spacious', label: t('settings.appearance.cardSize.spacious') },
  ];

  return (
    <SettingsSection
      kanji="色"
      eyebrow={t('settings.section.appearance')}
      title={t('settings.appearance.title')}
      description={t('settings.appearance.description')}
    >
      <SettingRow
        label={t('settings.appearance.theme.label')}
        hint={t('settings.appearance.theme.hint')}
      >
        <Segmented<Theme>
          ariaLabel={t('settings.appearance.theme.label')}
          value={appearance.theme}
          options={THEME_OPTIONS}
          onChange={value => patch({ theme: value })}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.appearance.fontSize.label')}
        hint={t('settings.appearance.fontSize.hint')}
      >
        <Segmented<FontSize>
          ariaLabel={t('settings.appearance.fontSize.label')}
          value={appearance.fontSize}
          options={FONT_SIZE_OPTIONS}
          onChange={value => patch({ fontSize: value })}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.appearance.readingFont.label')}
        hint={t('settings.appearance.readingFont.hint')}
      >
        <Segmented<ReadingFont>
          ariaLabel={t('settings.appearance.readingFont.label')}
          value={appearance.readingFont}
          options={READING_FONT_OPTIONS}
          onChange={value => patch({ readingFont: value })}
        />
      </SettingRow>

      <SettingRow
        label={t('settings.appearance.cardSize.label')}
        hint={t('settings.appearance.cardSize.hint')}
      >
        <Segmented<CardSize>
          ariaLabel={t('settings.appearance.cardSize.label')}
          value={appearance.cardSize}
          options={CARD_SIZE_OPTIONS}
          onChange={value => patch({ cardSize: value })}
        />
      </SettingRow>

      <SettingRow label={t('settings.language.label')}>
        <Segmented<Language>
          ariaLabel={t('settings.language.label')}
          value={language}
          options={LANGUAGE_OPTIONS}
          onChange={setLanguage}
        />
      </SettingRow>
    </SettingsSection>
  );
}
