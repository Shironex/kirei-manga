// Mocks must be declared before importing the service so jest hoists them
// ahead of the require chain inside the constructor.
const mockDetectBubbles = jest.fn();

jest.mock(
  '@kireimanga/bubble-detector',
  () => ({ detectBubbles: mockDetectBubbles }),
  { virtual: true }
);

const mockImageSize = jest.fn();
jest.mock('image-size', () => ({
  __esModule: true,
  imageSize: (...args: unknown[]) => mockImageSize(...args),
}));

const mockOpen = jest.fn();
jest.mock('fs/promises', () => ({
  __esModule: true,
  open: (...args: unknown[]) => mockOpen(...args),
}));

import { BubbleDetectorService } from './bubble-detector.service';

/**
 * Minimal stand-in for the FileHandle returned by `fs.open`. We never inspect
 * the buffer contents — `image-size` is mocked — so a no-op `read` and a
 * resolving `close` are enough.
 */
function makeFileHandle(): { read: jest.Mock; close: jest.Mock } {
  return {
    read: jest.fn().mockResolvedValue({ bytesRead: 1024 }),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

describe('BubbleDetectorService', () => {
  beforeEach(() => {
    mockDetectBubbles.mockReset();
    mockImageSize.mockReset();
    mockOpen.mockReset();
    jest.resetModules();
  });

  describe('addon load succeeds', () => {
    it('reports healthy via getStatus()', () => {
      const service = new BubbleDetectorService();
      expect(service.getStatus()).toEqual({ healthy: true });
    });

    it('detect() returns boxes + dimensions + duration on the happy path', async () => {
      mockOpen.mockResolvedValue(makeFileHandle());
      mockImageSize.mockReturnValue({ width: 1500, height: 2200 });
      const expectedBoxes = [{ x: 10, y: 20, w: 100, h: 50, confidence: 0.9 }];
      mockDetectBubbles.mockResolvedValue(expectedBoxes);

      const service = new BubbleDetectorService();
      const result = await service.detect('/tmp/page-001.jpg');

      expect(result.boxes).toEqual(expectedBoxes);
      expect(result.imageWidth).toBe(1500);
      expect(result.imageHeight).toBe(2200);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockDetectBubbles).toHaveBeenCalledWith('/tmp/page-001.jpg');
    });

    it('detect() rejects on an empty path before touching the addon', async () => {
      const service = new BubbleDetectorService();
      await expect(service.detect('')).rejects.toThrow(/non-empty string/i);
      expect(mockOpen).not.toHaveBeenCalled();
      expect(mockDetectBubbles).not.toHaveBeenCalled();
    });

    it('detect() propagates an addon rejection as a clear error', async () => {
      mockOpen.mockResolvedValue(makeFileHandle());
      mockImageSize.mockReturnValue({ width: 1500, height: 2200 });
      mockDetectBubbles.mockRejectedValue(new Error('opencv: cv::imread failed'));

      const service = new BubbleDetectorService();
      await expect(service.detect('/tmp/page-002.jpg')).rejects.toThrow(
        /opencv: cv::imread failed/
      );
    });
  });

  describe('addon load fails', () => {
    /**
     * Re-mock the addon to throw — mirrors the production case where
     * `node-gyp-build` finds neither a prebuild nor a local build.
     */
    function withFailingAddon(): typeof BubbleDetectorService {
      jest.doMock(
        '@kireimanga/bubble-detector',
        () => {
          throw new Error('No native build was found for platform=win32 arch=x64');
        },
        { virtual: true }
      );
      // Re-require the service so its constructor sees the failing mock.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./bubble-detector.service').BubbleDetectorService;
    }

    it('still constructs and reports unhealthy via getStatus()', () => {
      const Cls = withFailingAddon();
      const service = new Cls();
      const status = service.getStatus();
      expect(status.healthy).toBe(false);
      expect(status.reason).toMatch(/No native build was found/);
    });

    it('detect() rejects with a clear error mentioning the failure reason', async () => {
      const Cls = withFailingAddon();
      const service = new Cls();
      await expect(service.detect('/tmp/page.jpg')).rejects.toThrow(
        /Bubble detector unavailable.*No native build was found/s
      );
    });
  });

  describe('addon loaded but malformed', () => {
    it('marks unhealthy when detectBubbles is not a function', () => {
      jest.doMock('@kireimanga/bubble-detector', () => ({}), { virtual: true });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Cls = require('./bubble-detector.service').BubbleDetectorService;
      const service = new Cls();
      const status = service.getStatus();
      expect(status.healthy).toBe(false);
      expect(status.reason).toMatch(/detectBubbles/);
    });
  });
});
