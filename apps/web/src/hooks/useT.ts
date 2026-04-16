/**
 * `useT()` — translator hook bound to the current `settings.language`.
 *
 * Returns a `t(key, vars?)` function that:
 *   - looks up `key` in the active dictionary (English fallback);
 *   - falls back to the key itself for missing entries (visible in UI);
 *   - resolves `{name}` placeholders against `vars`;
 *   - when `vars.count` is a number, tries `key_<category>` first (where
 *     `<category>` is the CLDR form returned by `Intl.PluralRules` —
 *     `one`, `few`, `many`, `other`, etc.) and falls back to `key`.
 *
 * Usage:
 * ```tsx
 * const t = useT();
 * <span>{t('library.subtitle.count', { count: 12 })}</span>
 * ```
 */
import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settings-store';
import { getDictionary } from '@/i18n';

type Vars = Record<string, string | number>;
type Translator = (key: string, vars?: Vars) => string;

export function useT(): Translator {
  const lang = useSettingsStore(s => s.settings?.language ?? 'en');
  return useMemo<Translator>(() => {
    const dict = getDictionary(lang);
    const pluralRules = new Intl.PluralRules(lang);
    return (key, vars) => {
      let template = dict[key] ?? key;
      if (vars && typeof vars.count === 'number') {
        const category = pluralRules.select(vars.count);
        const suffixed = dict[`${key}_${category}`];
        if (suffixed !== undefined) template = suffixed;
      }
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));
    };
  }, [lang]);
}
