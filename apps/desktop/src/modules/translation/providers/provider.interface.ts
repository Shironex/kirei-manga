import type { TranslationProviderId, TranslationProviderStatus } from '@kireimanga/shared';

/**
 * Contract for a translation backend (DeepL, Google, Ollama).
 *
 * Tesseract is included in `TranslationProviderId` but is OCR-only — it
 * does not implement this interface. The orchestrator (Slice F) handles
 * the OCR-vs-translate split.
 */
export interface TranslationProvider {
  /** Stable identity matching the cache `provider` column. */
  readonly id: Exclude<TranslationProviderId, 'tesseract-only'>;

  /**
   * Translate a batch of source strings into the target language.
   * Implementations decide how to chunk requests; callers pass the full batch
   * for a page and get one result per input in original order.
   *
   * @param texts source strings (non-empty)
   * @param targetLang BCP-47 language tag (e.g. 'en', 'pl')
   * @throws if the request fails non-recoverably (auth, network, etc.) — the
   *   orchestrator catches and surfaces via gateway error.
   */
  translate(texts: string[], targetLang: string): Promise<string[]>;

  /**
   * Probe the provider's health. Used by the settings UI's "Test" button
   * and by the periodic provider-status refresh. Cheap; no source calls
   * required if the provider can self-introspect (e.g. DeepL `/usage`).
   */
  status(): Promise<TranslationProviderStatus>;
}
