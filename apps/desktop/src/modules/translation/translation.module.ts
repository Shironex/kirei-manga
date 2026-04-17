import { Module } from '@nestjs/common';
import { BubbleDetectorService } from './bubble-detector.service';
import { OcrSidecarDownloader, OcrSidecarService } from './sidecar';

/**
 * Translation pipeline module. Slice B.5 wired the bubble detector;
 * Slice D.4 adds the OCR sidecar manager + downloader. Translation
 * provider / cache / orchestrator services land in Slices E / F.
 */
@Module({
  providers: [BubbleDetectorService, OcrSidecarDownloader, OcrSidecarService],
  exports: [BubbleDetectorService, OcrSidecarDownloader, OcrSidecarService],
})
export class TranslationModule {}
