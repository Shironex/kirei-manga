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
