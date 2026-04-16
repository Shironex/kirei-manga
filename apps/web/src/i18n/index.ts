/**
 * Tiny i18n facade: a flat `Record<string, string>` per language and a lookup
 * helper. No runtime dependency on i18next or formatjs — KireiManga's UI copy
 * is small enough that a hand-rolled record is honest and inspectable.
 *
 * Resolution order: requested language → English fallback. Missing keys fall
 * through to the key itself so a typo surfaces visibly in the UI rather than
 * silently rendering empty.
 */
import type { Language } from '@kireimanga/shared';
import { en } from './en';
import { pl } from './pl';

export const DICTIONARIES: Record<Language, Record<string, string>> = {
  en,
  pl,
};

export function getDictionary(lang: Language): Record<string, string> {
  return DICTIONARIES[lang] ?? DICTIONARIES.en;
}

/** Strongly-typed key set — derived from the English source of truth. */
export type TranslationKey = keyof typeof en;
