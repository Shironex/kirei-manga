import type { TranslationSettings } from '@kireimanga/shared';
import { useT } from '@/hooks/useT';
import { useSettingsStore } from '@/stores/settings-store';
import { SettingRow } from '@/components/settings/SettingsSection';
import {
  OpacitySlider,
  ProviderSelect,
  TextInput,
  ToggleSwitch,
  type DisplayProviderId,
} from '@/components/settings/translation-form-primitives';

export interface TranslationOverrideFormProps {
  /**
   * Current series-level override. `undefined` means "use global settings"
   * — the form renders the toggle as on and the field rows collapse.
   */
  override: Partial<TranslationSettings> | undefined;
  /**
   * Called when the user changes any field. Pass `undefined` to clear the
   * override entirely (toggle "Use global" back on).
   */
  onChange: (next: Partial<TranslationSettings> | undefined) => void;
}

/**
 * Per-series translation override form (Slice H.2). Reuses the global panel's
 * field primitives (`translation-form-primitives`) so the visual rhythm
 * matches Settings exactly.
 *
 * Field set: `defaultProvider`, `targetLang`, `autoTranslate`, `overlayFont`,
 * `overlayOpacity`. Intentionally omitted:
 *   - `providerKeys` — keys are per-user, not per-series. Multiple DeepL keys
 *     across series would be confusing UX (and mostly meaningless — billing is
 *     per-key, not per-document).
 *   - `enabled` — the global enabled flag is the master switch. A "disable
 *     translation for just this series" toggle could land later if users ask,
 *     but it overlaps with auto-translate enough that we punt for now.
 *
 * Empty values for omitted fields fall back to global at pipeline invocation
 * (Slice H.3 owns the resolution); placeholders show the global value as a
 * hint so the user sees what they'd inherit.
 */
export function TranslationOverrideForm({ override, onChange }: TranslationOverrideFormProps) {
  const t = useT();
  // Read global defaults so the form can show them as placeholder hints when
  // the user opens override mode and the field is empty. Defaults live on the
  // settings store; falling back to a static-ish defaults object would drift.
  const globalTranslation = useSettingsStore(s => s.settings?.translation);

  const usingGlobal = override === undefined;

  const handleToggleGlobal = (nextChecked: boolean): void => {
    // Toggle ON  → use global → clear the override entirely.
    // Toggle OFF → start with an empty override (callee may add fields next).
    onChange(nextChecked ? undefined : {});
  };

  // Effective values: prefer the override, fall back to the global field, then
  // a final defensive default (in case the settings store hasn't loaded yet).
  // Coercing here keeps each row's input always controlled.
  const effective: Required<
    Pick<
      TranslationSettings,
      | 'defaultProvider'
      | 'sourceLang'
      | 'targetLang'
      | 'autoTranslate'
      | 'overlayFont'
      | 'overlayOpacity'
    >
  > = {
    defaultProvider: override?.defaultProvider ?? globalTranslation?.defaultProvider ?? 'deepl',
    sourceLang: override?.sourceLang ?? globalTranslation?.sourceLang ?? 'ja',
    targetLang: override?.targetLang ?? globalTranslation?.targetLang ?? 'en',
    autoTranslate: override?.autoTranslate ?? globalTranslation?.autoTranslate ?? false,
    overlayFont: override?.overlayFont ?? globalTranslation?.overlayFont ?? 'Fraunces',
    overlayOpacity: override?.overlayOpacity ?? globalTranslation?.overlayOpacity ?? 1,
  };

  const patch = (partial: Partial<TranslationSettings>): void => {
    // Spread on top of the existing override (or {} when toggling off global
    // for the first time). Never re-introduce `undefined` — that's the signal
    // for "use global settings" at the row level.
    onChange({ ...(override ?? {}), ...partial });
  };

  return (
    <div className="flex flex-col gap-5" data-testid="translation-override-form">
      <SettingRow
        label={t('series.translationOverride.useGlobal.label')}
        hint={t('series.translationOverride.useGlobal.hint')}
      >
        <ToggleSwitch
          checked={usingGlobal}
          onChange={handleToggleGlobal}
          ariaLabel={t('series.translationOverride.useGlobal.label')}
        />
      </SettingRow>

      {!usingGlobal && (
        <div
          className="flex flex-col gap-5 border-l-2 border-[var(--color-rule-strong)] pl-5"
          data-testid="translation-override-fields"
        >
          <SettingRow
            label={t('settings.translation.autoTranslate.label')}
            hint={t('settings.translation.autoTranslate.hint')}
          >
            <ToggleSwitch
              checked={effective.autoTranslate}
              onChange={value => patch({ autoTranslate: value })}
              ariaLabel={t('settings.translation.autoTranslate.label')}
            />
          </SettingRow>

          <SettingRow
            label={t('settings.translation.defaultProvider.label')}
            hint={t('settings.translation.defaultProvider.hint')}
          >
            <ProviderSelect
              value={effective.defaultProvider}
              disabled={false}
              ariaLabel={t('settings.translation.defaultProvider.label')}
              onChange={(value: DisplayProviderId) => patch({ defaultProvider: value })}
              t={t}
              testId="translation-override-provider"
            />
          </SettingRow>

          <SettingRow
            label={t('settings.translation.sourceLang.label')}
            hint={t('settings.translation.sourceLang.hint')}
          >
            <TextInput
              value={effective.sourceLang}
              onChange={value => patch({ sourceLang: value.trim() === '' ? 'ja' : value })}
              placeholder={globalTranslation?.sourceLang ?? 'ja'}
              ariaLabel={t('settings.translation.sourceLang.label')}
              data-testid="translation-override-source-lang"
              widthClass="w-24"
            />
          </SettingRow>

          <SettingRow
            label={t('settings.translation.targetLang.label')}
            hint={t('settings.translation.targetLang.hint')}
          >
            <TextInput
              value={effective.targetLang}
              onChange={value => patch({ targetLang: value })}
              placeholder={globalTranslation?.targetLang ?? 'en'}
              ariaLabel={t('settings.translation.targetLang.label')}
              data-testid="translation-override-target-lang"
              widthClass="w-24"
            />
          </SettingRow>

          <SettingRow
            label={t('settings.translation.overlayFont.label')}
            hint={t('settings.translation.overlayFont.hint')}
          >
            <TextInput
              value={effective.overlayFont}
              onChange={value => patch({ overlayFont: value })}
              placeholder={globalTranslation?.overlayFont ?? 'Fraunces'}
              ariaLabel={t('settings.translation.overlayFont.label')}
              data-testid="translation-override-overlay-font"
              widthClass="w-44"
            />
          </SettingRow>

          <SettingRow
            label={t('settings.translation.overlayOpacity.label')}
            hint={t('settings.translation.overlayOpacity.hint')}
          >
            <OpacitySlider
              value={effective.overlayOpacity}
              disabled={false}
              onChange={value => patch({ overlayOpacity: value })}
              ariaLabel={t('settings.translation.overlayOpacity.label')}
              testId="translation-override-overlay-opacity"
            />
          </SettingRow>
        </div>
      )}
    </div>
  );
}
