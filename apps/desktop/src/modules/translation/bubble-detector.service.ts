import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import { performance } from 'perf_hooks';
import { imageSize } from 'image-size';
import { createLogger } from '@kireimanga/shared';
import type { BoundingBox, BubbleDetectionResult } from '@kireimanga/shared';

const logger = createLogger('BubbleDetectorService');

/**
 * Header byte budget read from disk before handing the buffer to `image-size`.
 * 64KB is well past the SOI/SOF/IHDR/VP8X/etc. headers for every common page
 * format (JPEG, PNG, WebP, GIF) but small enough to keep the syscall cheap.
 */
const HEADER_BYTES = 64 * 1024;

/**
 * Shape of the native addon module — declared locally so the service compiles
 * even when `@kireimanga/bubble-detector` resolves to nothing useful at
 * runtime. The native side guarantees this signature once OpenCV + the addon
 * are built (see `native/bubble-detector/src/main.cpp`).
 */
interface BubbleDetectorAddon {
  detectBubbles(
    imagePath: string,
    options?: { direction?: 'rtl' | 'ltr' },
  ): Promise<BoundingBox[]>;
}

/**
 * Self-reported health of the bubble detector. Not part of the
 * `TranslationProviderStatus` union — the bubble detector is a pipeline
 * component, not a translation provider. Slice F's orchestrator folds this
 * into the renderer-visible status payload.
 */
export interface BubbleDetectorStatus {
  healthy: boolean;
  reason?: string;
}

/**
 * Wraps the C++ `@kireimanga/bubble-detector` native addon. Boot-safe: if the
 * addon fails to load (no prebuild, missing OpenCV, ABI mismatch) the service
 * still constructs, surfaces the failure via `getStatus()`, and rejects every
 * `detect()` call with a clear error. The desktop boots normally and
 * translation self-marks unhealthy per the cross-cutting rule.
 */
@Injectable()
export class BubbleDetectorService {
  private readonly addon: BubbleDetectorAddon | null;
  private readonly healthy: boolean;
  private readonly failureReason: string | undefined;

  constructor() {
    let loaded: BubbleDetectorAddon | null = null;
    let healthy = false;
    let failureReason: string | undefined;

    try {
      // Synchronous require — `node-gyp-build` resolves the prebuild here, so
      // any "no native build was found" / OpenCV link error throws right now.
      const required = require('@kireimanga/bubble-detector') as Partial<BubbleDetectorAddon>;
      if (typeof required?.detectBubbles !== 'function') {
        failureReason =
          '@kireimanga/bubble-detector loaded but does not expose detectBubbles(); ' +
          'check the native addon build.';
        logger.warn(failureReason);
      } else {
        loaded = required as BubbleDetectorAddon;
        healthy = true;
        logger.info('Bubble-detector native addon loaded.');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failureReason = message;
      logger.warn(
        `Bubble-detector native addon failed to load: ${message}. ` +
          'Translation pipeline will self-mark unhealthy. ' +
          'Run `pnpm fetch-prebuilds` or build locally via ' +
          '`pnpm --filter @kireimanga/bubble-detector run build` (requires OpenCV).'
      );
    }

    this.addon = loaded;
    this.healthy = healthy;
    this.failureReason = failureReason;
  }

  /** Snapshot of detector load health for the orchestrator / renderer status panel. */
  getStatus(): BubbleDetectorStatus {
    return this.healthy
      ? { healthy: true }
      : { healthy: false, reason: this.failureReason };
  }

  /**
   * Detect speech-bubble bounding boxes on a single page image. Reads the file
   * header to attach `imageWidth`/`imageHeight` (the native addon doesn't
   * return them) and times the addon call. `options.direction` controls the
   * within-row reading-order sort (default `'rtl'` for manga); Slice F's
   * orchestrator pulls the per-series override from `Series.translationOverride`.
   */
  async detect(
    imagePath: string,
    options: { direction?: 'rtl' | 'ltr' } = {},
  ): Promise<BubbleDetectionResult> {
    if (!this.healthy || !this.addon) {
      const reason = this.failureReason ?? 'unknown failure';
      throw new Error(
        `Bubble detector unavailable: ${reason}. ` +
          'Run `pnpm fetch-prebuilds` or build the native addon ' +
          '(`pnpm --filter @kireimanga/bubble-detector run build` — requires OpenCV).'
      );
    }
    if (typeof imagePath !== 'string' || imagePath.length === 0) {
      throw new Error('detect(): imagePath must be a non-empty string.');
    }

    const direction = options.direction ?? 'rtl';

    const t0 = performance.now();

    // Read just the header — `image-size` only needs the SOI/SOF/IHDR/VP8X
    // bytes, and pulling the whole page (often several MB) would waste IO on
    // every detection call. Falls back to reading the whole file if it's
    // smaller than the header budget.
    const fh = await fs.open(imagePath, 'r');
    let dimensions: { width?: number; height?: number };
    try {
      const buffer = Buffer.alloc(HEADER_BYTES);
      const { bytesRead } = await fh.read(buffer, 0, HEADER_BYTES, 0);
      const slice = bytesRead < HEADER_BYTES ? buffer.subarray(0, bytesRead) : buffer;
      dimensions = imageSize(slice);
    } finally {
      await fh.close();
    }

    const imageWidth = dimensions.width;
    const imageHeight = dimensions.height;
    if (typeof imageWidth !== 'number' || typeof imageHeight !== 'number') {
      throw new Error(`detect(): could not determine image dimensions for ${imagePath}.`);
    }

    const boxes = await this.addon.detectBubbles(imagePath, { direction });
    const durationMs = performance.now() - t0;

    return {
      boxes,
      imageWidth,
      imageHeight,
      durationMs,
    };
  }
}
