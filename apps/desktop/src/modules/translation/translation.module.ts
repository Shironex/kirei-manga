import { Module } from '@nestjs/common';
import { BubbleDetectorService } from './bubble-detector.service';
import { OcrSidecarDownloader, OcrSidecarService } from './sidecar';
import { TranslationGateway } from './translation.gateway';

/**
 * Translation pipeline module. Slice B.5 wired the bubble detector;
 * Slice D.4 added the OCR sidecar manager + downloader; Slice D.5 exposes
 * the `translation:provider-status` gateway. Translation provider / cache /
 * orchestrator services land in Slices E / F.
 */
@Module({
  providers: [
    BubbleDetectorService,
    OcrSidecarDownloader,
    OcrSidecarService,
    TranslationGateway,
  ],
  exports: [BubbleDetectorService, OcrSidecarDownloader, OcrSidecarService],
})
export class TranslationModule {}
