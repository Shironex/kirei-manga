import { Injectable } from '@nestjs/common';
import {
  createLogger,
  type PageTranslation,
  type TranslationProviderId,
} from '@kireimanga/shared';
import { PageUrlResolverService } from '../shared/page-url-resolver';
import { SettingsService } from '../settings';
import { BubbleDetectorService } from './bubble-detector.service';
import { TranslationCacheService, pageHash } from './cache';
import { TranslationProviderRegistry } from './providers';
import { OcrBackendRegistry } from './sidecar';

/**
 * Slice F.3 — orchestrates the full per-page translation pipeline:
 * hash → provider pick → cache lookup → bubble detect → OCR → translate
 * → per-bubble cache writes → return `PageTranslation`.
 *
 * Page-image-keyed only; per-series settings overlay (`Series.translationOverride`)
 * resolves at the gateway/series layer (Slice H) and is passed in as args.
 */
@Injectable()
export class TranslationService {
  private readonly logger = createLogger('TranslationService');

  constructor(
    private readonly bubbleDetector: BubbleDetectorService,
    private readonly ocrBackends: OcrBackendRegistry,
    private readonly registry: TranslationProviderRegistry,
    private readonly cache: TranslationCacheService,
    private readonly resolver: PageUrlResolverService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Run the full translation pipeline for one page image. The caller may
   * supply either an already-resolved `pageImagePath` (preferred when
   * known) or a `pageUrl` — typically a `kirei-page://...` proxy address —
   * which the resolver maps to a real on-disk path before hashing. Passing
   * both takes `pageImagePath` as a hint that resolution already happened.
   *
   * `sourceLang` is optional — when omitted, the orchestrator falls back to
   * `AppSettings.translation.sourceLang` (defaults to `'ja'`). Threaded
   * through to: (1) the OCR backend registry's pickBackend (skips the
   * Japanese-only sidecar for non-`'ja'` sources), (2) the chosen backend's
   * ocr() call (Tesseract picks the right traineddata), and (3) the
   * provider's translate() (DeepL `source_lang`, Google `source`, Ollama
   * prompt label).
   */
  async runPipeline(args: {
    pageImagePath?: string;
    pageUrl?: string;
    targetLang: string;
    sourceLang?: string;
    providerHint?: TranslationProviderId;
    direction?: 'rtl' | 'ltr';
  }): Promise<PageTranslation> {
    const {
      pageImagePath,
      pageUrl,
      targetLang,
      sourceLang,
      providerHint,
      direction = 'rtl',
    } = args;
    // Fall back to the persisted setting (which itself defaults to `'ja'` via
    // DEFAULT_APP_SETTINGS) when the caller omits the override.
    const effectiveSourceLang =
      sourceLang ?? this.settings.get().translation.sourceLang ?? 'ja';

    // 0. Resolve URL → filesystem path when only the URL is known. The
    //    explicit-path branch wins so existing callers (F.5 integration test,
    //    cache warm-ups) skip the resolver entirely.
    let resolvedPath: string;
    if (typeof pageImagePath === 'string' && pageImagePath.length > 0) {
      resolvedPath = pageImagePath;
    } else if (typeof pageUrl === 'string' && pageUrl.length > 0) {
      resolvedPath = await this.resolver.resolveToFilesystemPath(pageUrl);
    } else {
      throw new Error('runPipeline: exactly one of pageImagePath / pageUrl must be provided');
    }

    // 1. Hash the page image.
    const pageHashValue = await pageHash(resolvedPath);

    // 2. Resolve the provider — picked BEFORE the cache lookup because the
    //    cache key includes provider id (a hint can swing us to a different
    //    cache row).
    const provider = await this.registry.pickProvider(providerHint);

    // 3. Cache hit? Short-circuit the rest of the pipeline.
    const cached = this.cache.getForPage(pageHashValue, targetLang, provider.id);
    if (cached) {
      this.logger.debug(
        `cache hit for ${pageHashValue.slice(0, 8)} (${targetLang}/${provider.id})`,
      );
      return cached;
    }

    // 4. Detect bubbles via the native addon.
    const detection = await this.bubbleDetector.detect(resolvedPath, { direction });
    if (detection.boxes.length === 0) {
      this.logger.debug(`no bubbles detected on ${pageHashValue.slice(0, 8)}`);
      return { pageHash: pageHashValue, bubbles: [] };
    }

    // 5. OCR every detected bubble. The registry hands us the first healthy
    //    backend — sidecar (manga-ocr) for Japanese, Tesseract otherwise.
    //    Same call shape either way; the orchestrator never branches on which.
    const ocrBackend = this.ocrBackends.pickBackend(effectiveSourceLang);
    const ocrResults = await ocrBackend.ocr(
      resolvedPath,
      detection.boxes.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
      effectiveSourceLang,
    );

    // 6. Translate — drop empty OCR results so we don't waste API quota; map
    //    back to original indices when composing the response.
    const indexedTexts = ocrResults
      .map((r, i) => ({ index: i, text: r.text }))
      .filter(e => e.text.trim().length > 0);
    const translations =
      indexedTexts.length === 0
        ? []
        : await provider.translate(
            indexedTexts.map(e => e.text),
            targetLang,
            effectiveSourceLang,
          );

    // 7. Compose result + persist successful bubbles. Empty translations
    //    (or empty originals) are intentionally NOT cached — keeps the cache
    //    clean for retry attempts on the next pipeline run. `putBubble` is
    //    idempotent and per-row, so a mid-page crash leaves partial progress
    //    that the next run can resume from cleanly.
    const bubbles: PageTranslation['bubbles'] = [];
    for (let i = 0; i < detection.boxes.length; i++) {
      const box = detection.boxes[i];
      const original = ocrResults[i]?.text ?? '';
      const matched = indexedTexts.findIndex(e => e.index === i);
      const translated = matched >= 0 ? translations[matched] ?? '' : '';
      bubbles.push({
        box,
        original,
        translated,
        provider: provider.id,
        targetLang,
      });
      if (translated.trim().length > 0 && original.trim().length > 0) {
        this.cache.putBubble({
          pageHash: pageHashValue,
          bubbleIndex: i,
          box,
          original,
          translated,
          targetLang,
          provider: provider.id,
        });
      }
    }

    return { pageHash: pageHashValue, bubbles };
  }
}
