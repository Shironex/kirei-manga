/**
 * `useT()` — translator hook bound to the current `settings.language`.
 *
 * Returns a `t(key, vars?)` function that:
 *   - looks up `key` in the active dictionary (English fallback);
 *   - falls back to the key itself for missing entries (visible in UI);
 *   - resolves `{name}` placeholders against `vars`.
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
  // Stabilize the returned function identity per-language. Without this the
  // closure is re-created every render, which poisons `useCallback`/`useEffect`
  // dep arrays that include `t` (e.g. LibrarySection's cache-size fetch loop).
  return useMemo<Translator>(() => {
    const dict = getDictionary(lang);
    return (key, vars) => {
      const template = dict[key] ?? key;
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(vars[name] ?? '')
      );
    };
  }, [lang]);
}
