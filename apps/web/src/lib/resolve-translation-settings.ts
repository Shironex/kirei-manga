import type { TranslationSettings } from '@kireimanga/shared';

/**
 * Compute effective translation settings for a given series.
 *
 *   effective = global ∪ override
 *
 * The `global` argument is `AppSettings.translation` — always fully populated
 * with every key (defaults shipped in `DEFAULT_APP_SETTINGS`). The `override`
 * argument is `Series.translationOverride` — `Partial<TranslationSettings>`
 * holding only the keys the user chose to deviate on at the per-series level.
 *
 * Resolution rules:
 *   - `override === undefined` (or `null`) → return `global` unchanged. The
 *     reader hook short-circuits in this case so the resolver isn't on the
 *     hot path for series without an override.
 *   - top-level keys in `override` win over the matching key in `global`
 *     (shallow spread — no deep merge for primitive fields).
 *   - `override.providerKeys` is shallow-MERGED on top of `global.providerKeys`
 *     rather than replaced. Series almost never set provider keys themselves,
 *     but if a series does pin (say) a different DeepL key for that title we
 *     don't want to also wipe the user's Google + Ollama credentials in the
 *     process.
 *
 * Pure / deterministic — no React state, no I/O. The hook layer wraps it in
 * `useMemo` keyed on `[global, override]` so a stable override reference
 * doesn't recompute downstream effects.
 */
export function resolveTranslationSettings(
  global: TranslationSettings,
  override: Partial<TranslationSettings> | null | undefined,
): TranslationSettings {
  if (!override) return global;
  return {
    ...global,
    ...override,
    providerKeys: {
      ...global.providerKeys,
      ...(override.providerKeys ?? {}),
    },
  };
}
