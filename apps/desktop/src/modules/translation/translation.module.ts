import { Module } from '@nestjs/common';
import { BubbleDetectorService } from './bubble-detector.service';

/**
 * Translation pipeline module. Slice B.5 wires only the bubble detector;
 * OCR / translation provider / cache / orchestrator services land in
 * Slices D / E / F.
 */
@Module({
  providers: [BubbleDetectorService],
  exports: [BubbleDetectorService],
})
export class TranslationModule {}
