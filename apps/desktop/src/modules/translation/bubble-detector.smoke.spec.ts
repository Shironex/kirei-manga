// Slice B.6 end-to-end smoke test for the real bubble-detector addon.
//
// Unlike `bubble-detector.service.spec.ts` (which mocks the addon entirely),
// this spec exercises the actual native binary when a prebuild is resolvable
// from `@kireimanga/bubble-detector`. It proves:
//
//   - node-gyp-build locates a platform/arch prebuild,
//   - OpenCV's cv::imread decodes a real PNG off disk,
//   - the AsyncWorker path resolves the Promise cleanly,
//   - image-size reports the fixture's declared dimensions,
//   - durationMs is populated.
//
// In environments without a prebuild (most dev machines; CI jobs other than
// `native-prebuild`), the suite auto-skips with a `console.warn` rather than
// failing — the mocked spec covers the service's contract regardless.
//
// Fixture: `apps/desktop/test/fixtures/translation/blank-bubble.png` — a
// hand-rolled 100x100 solid-white PNG, ~118 bytes, committed. Regeneration
// recipe lives in that directory's README.

import * as path from 'path';
import { existsSync } from 'fs';

interface BubbleDetectorAddon {
  detectBubbles(imagePath: string): Promise<unknown>;
}

function tryLoadAddon(): { addon: BubbleDetectorAddon | null; error: string | null } {
  try {
    const required = require('@kireimanga/bubble-detector') as Partial<BubbleDetectorAddon>;
    if (typeof required?.detectBubbles !== 'function') {
      return { addon: null, error: 'addon loaded but missing detectBubbles' };
    }
    return { addon: required as BubbleDetectorAddon, error: null };
  } catch (err) {
    return { addon: null, error: err instanceof Error ? err.message : String(err) };
  }
}

const { addon: realAddon, error: loadError } = tryLoadAddon();

const FIXTURE = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'test',
  'fixtures',
  'translation',
  'blank-bubble.png'
);

const describeIfAddon = realAddon && existsSync(FIXTURE) ? describe : describe.skip;

if (!realAddon) {
  console.warn(
    `[bubble-detector.smoke] skipping: real addon unavailable (${loadError ?? 'unknown'}). ` +
      'Run `pnpm --filter @kireimanga/bubble-detector run prebuild` (requires OpenCV) ' +
      'or download prebuilds via `pnpm fetch-prebuilds`.'
  );
} else if (!existsSync(FIXTURE)) {
  console.warn(`[bubble-detector.smoke] skipping: fixture missing at ${FIXTURE}`);
}

describeIfAddon('BubbleDetectorService (real addon, end-to-end)', () => {
  it('detect(blank-bubble.png) returns a well-formed BubbleDetectionResult', async () => {
    // Lazy-require so the non-skipped path runs with the real module resolver
    // (the mocked spec resets modules in its own beforeEach — order-independent).
    const { BubbleDetectorService } = require('./bubble-detector.service');
    const service = new BubbleDetectorService();

    expect(service.getStatus()).toEqual({ healthy: true });

    const result = await service.detect(FIXTURE);

    expect(Array.isArray(result.boxes)).toBe(true);
    // Blank page: no convex blob passes the geometric filter — match the
    // C++ unit test's `BlankPageReturnsNoBubbles` invariant.
    expect(result.boxes.length).toBe(0);
    expect(result.imageWidth).toBe(100);
    expect(result.imageHeight).toBe(100);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
