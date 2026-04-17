import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings';
import { BubbleDetectorService } from './bubble-detector.service';
import { DeepLProvider } from './providers';
import { OcrSidecarDownloader, OcrSidecarService } from './sidecar';
import { TranslationGateway } from './translation.gateway';

/**
 * Translation pipeline module. Slice B.5 wired the bubble detector;
 * Slice D.4 added the OCR sidecar manager + downloader; Slice D.5 exposes
 * the `translation:provider-status` gateway; Slice E.2 adds the DeepL
 * provider. Registry + orchestrator land in Slices E.3 / F.
 */
@Module({
  imports: [SettingsModule],
  providers: [
    BubbleDetectorService,
    OcrSidecarDownloader,
    OcrSidecarService,
    DeepLProvider,
    TranslationGateway,
  ],
  exports: [BubbleDetectorService, OcrSidecarDownloader, OcrSidecarService, DeepLProvider],
})
export class TranslationModule {}
