import { Module } from '@nestjs/common';
import { LocalModule } from '../local';
import { SettingsModule } from '../settings';
import { PageUrlResolverService } from '../shared/page-url-resolver';
import { BubbleDetectorService } from './bubble-detector.service';
import { TranslationCacheService } from './cache';
import {
  DeepLProvider,
  GoogleTranslateProvider,
  TranslationProviderRegistry,
} from './providers';
import { OcrSidecarDownloader, OcrSidecarService } from './sidecar';
import { TranslationGateway } from './translation.gateway';
import { TranslationService } from './translation.service';

/**
 * Translation pipeline module. Slice B.5 wired the bubble detector;
 * Slice D.4 added the OCR sidecar manager + downloader; Slice D.5 exposes
 * the `translation:provider-status` gateway; Slice E.2 adds the DeepL
 * provider; Slice E.3 introduces the registry; Slice F.2 adds the SQLite
 * translation cache; Slice F.3 wires the `TranslationService` orchestrator
 * that ties hash → provider pick → cache → detect → OCR → translate → cache
 * writes for one page; Slice I.1 adds the Google Translate v2 provider.
 *
 * `DatabaseModule` is `@Global` so we don't import it explicitly here —
 * `TranslationCacheService` resolves `DatabaseService` from the global scope.
 */
@Module({
  imports: [SettingsModule, LocalModule],
  providers: [
    BubbleDetectorService,
    OcrSidecarDownloader,
    OcrSidecarService,
    DeepLProvider,
    GoogleTranslateProvider,
    TranslationProviderRegistry,
    TranslationCacheService,
    PageUrlResolverService,
    TranslationService,
    TranslationGateway,
  ],
  exports: [
    BubbleDetectorService,
    OcrSidecarDownloader,
    OcrSidecarService,
    DeepLProvider,
    GoogleTranslateProvider,
    TranslationProviderRegistry,
    TranslationCacheService,
    PageUrlResolverService,
    TranslationService,
  ],
})
export class TranslationModule {}
