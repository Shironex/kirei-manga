import { describe, expect, it } from 'vitest';
import {
  DEFAULT_OVERLAY_MODE,
  nextOverlayMode,
  type OverlayMode,
} from './overlay-mode';

describe('nextOverlayMode — cycle order', () => {
  it("starts the cycle at 'translated' by default", () => {
    expect(DEFAULT_OVERLAY_MODE).toBe('translated');
  });

  it("cycles translated → original → both → translated", () => {
    const sequence: OverlayMode[] = ['translated', 'original', 'both', 'translated'];
    let mode: OverlayMode = sequence[0];
    for (let i = 1; i < sequence.length; i++) {
      mode = nextOverlayMode(mode);
      expect(mode).toBe(sequence[i]);
    }
  });

  it('is a closed three-step cycle', () => {
    const start: OverlayMode = 'original';
    const after3 = nextOverlayMode(nextOverlayMode(nextOverlayMode(start)));
    expect(after3).toBe(start);
  });
});
