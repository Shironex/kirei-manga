import type { BoundingBox } from './series';

/**
 * Identifier for a translation provider available in the pipeline.
 * `tesseract-only` means OCR ran but no translation was requested.
 */
export type TranslationProviderId = 'deepl' | 'google' | 'ollama' | 'tesseract-only';

/**
 * Output of the bubble detector for a single page.
 */
export interface BubbleDetectionResult {
  boxes: BoundingBox[];
  imageWidth: number;
  imageHeight: number;
  durationMs: number;
}

/**
 * Translated bubbles for a single page, keyed by content hash.
 */
export interface PageTranslation {
  pageHash: string;
  bubbles: Array<{
    box: BoundingBox;
    original: string;
    translated: string;
    provider: TranslationProviderId;
    targetLang: string;
  }>;
}

/**
 * Health / quota snapshot for a translation provider.
 */
export interface TranslationProviderStatus {
  id: TranslationProviderId;
  ok: boolean;
  reason?: string;
  remainingChars?: number;
}

/**
 * User-facing translation pipeline settings. Lives on `AppSettings.translation`
 * as the global default; per-series overrides are merged on top via
 * `Series.translationOverride` (resolution lands in Slice F's orchestrator).
 *
 * Provider keys are persisted in the same store as the rest of `AppSettings` —
 * future hardening (Slice F) may move them behind the OS keychain.
 */
export interface TranslationSettings {
  /** Master switch. When false, the pipeline never runs regardless of overrides. */
  enabled: boolean;
  /** Provider used when a series doesn't pin one. */
  defaultProvider: TranslationProviderId;
  /**
   * BCP-47 source language tag. Defaults to `'ja'` (manga-OCR is Japanese-only;
   * the registry routes any other source through Tesseract). Setting this lets
   * users translate from already-translated bubbles (English scanlations →
   * Polish, etc.). Tesseract loads a per-language `traineddata` lazily on
   * first OCR call for that source.
   */
  sourceLang: string;
  /** ISO 639-1 target language, e.g. `en`. */
  targetLang: string;
  /** Translate eagerly on page open vs. on explicit user action. */
  autoTranslate: boolean;
  /** CSS font-family applied to overlay text (matches `ReadingFont` palette). */
  overlayFont: string;
  /** Overlay background opacity, `0` (transparent) – `1` (fully opaque). */
  overlayOpacity: number;
  /** Per-provider credentials. Empty object = nothing configured yet. */
  providerKeys: {
    deepl?: string;
    google?: string;
    ollamaEndpoint?: string;
    /**
     * Ollama model tag (e.g. `qwen2:7b`, `aya`). `providerKeys` is the
     * keys-only bucket today, but the model name lives alongside the
     * endpoint to keep all Ollama config in one nested object — matching
     * the shape consumed by the J.2 settings UI. Defaults to `'qwen2:7b'`
     * via `DEFAULT_APP_SETTINGS` when unset.
     */
    ollamaModel?: string;
  };
}
