import { describe, expect, it } from 'vitest';
import { DEFAULT_APP_SETTINGS, type TranslationSettings } from '@kireimanga/shared';
import { resolveTranslationSettings } from './resolve-translation-settings';

function baseGlobal(): TranslationSettings {
  // Clone so a test mutating the result doesn't leak across cases.
  return structuredClone({
    ...DEFAULT_APP_SETTINGS.translation,
    enabled: true,
    autoTranslate: false,
    defaultProvider: 'deepl',
    targetLang: 'en',
    overlayFont: 'Fraunces',
    overlayOpacity: 1,
    providerKeys: { deepl: 'global-deepl-key', google: 'global-google-key' },
  });
}

describe('resolveTranslationSettings', () => {
  it('returns global unchanged when override is undefined', () => {
    const global = baseGlobal();
    const effective = resolveTranslationSettings(global, undefined);
    expect(effective).toBe(global);
  });

  it('returns global unchanged when override is null', () => {
    const global = baseGlobal();
    const effective = resolveTranslationSettings(global, null);
    expect(effective).toBe(global);
  });

  it('returns a value structurally equal to global when override is the empty object', () => {
    const global = baseGlobal();
    const effective = resolveTranslationSettings(global, {});
    // Empty override still constructs a fresh object (the spread happens),
    // so identity changes — but every key must match the input.
    expect(effective).not.toBe(global);
    expect(effective).toEqual(global);
  });

  it('overrides scalar keys present in the override and leaves the rest at global values', () => {
    const global = baseGlobal();
    const effective = resolveTranslationSettings(global, {
      autoTranslate: true,
      targetLang: 'pl',
      defaultProvider: 'ollama',
    });
    expect(effective.autoTranslate).toBe(true);
    expect(effective.targetLang).toBe('pl');
    expect(effective.defaultProvider).toBe('ollama');
    // Unrelated keys still come from the global base.
    expect(effective.enabled).toBe(global.enabled);
    expect(effective.overlayFont).toBe(global.overlayFont);
    expect(effective.overlayOpacity).toBe(global.overlayOpacity);
  });

  it('shallow-merges providerKeys so a partial override does not wipe the others', () => {
    const global = baseGlobal();
    const effective = resolveTranslationSettings(global, {
      providerKeys: { deepl: 'series-specific-deepl-key' },
    });
    expect(effective.providerKeys).toEqual({
      deepl: 'series-specific-deepl-key',
      google: 'global-google-key',
    });
  });

  it('combines scalar + providerKeys overrides without dropping unrelated provider keys', () => {
    const global = baseGlobal();
    const effective = resolveTranslationSettings(global, {
      enabled: false,
      providerKeys: { ollamaEndpoint: 'http://series-host:11434' },
    });
    expect(effective.enabled).toBe(false);
    expect(effective.providerKeys).toEqual({
      deepl: 'global-deepl-key',
      google: 'global-google-key',
      ollamaEndpoint: 'http://series-host:11434',
    });
    // Scalar fields not in the override still match global.
    expect(effective.targetLang).toBe(global.targetLang);
  });
});
