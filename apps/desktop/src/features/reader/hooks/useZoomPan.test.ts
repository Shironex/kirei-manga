import { describe, expect, it } from 'vitest';

import { clampPan, MAX_ZOOM, zoomAt } from './useZoomPan';

describe('zoomAt', () => {
  it('keeps the point under the pointer still', () => {
    const next = zoomAt({ zoom: 1, x: 0, y: 0 }, 2, { x: 100, y: -50 });
    expect(next).toEqual({ zoom: 2, x: -100, y: 50 });
  });

  it('clamps the zoom and snaps back to fit at the minimum', () => {
    expect(zoomAt({ zoom: 3, x: 10, y: 10 }, 10).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ zoom: 1.2, x: 40, y: 40 }, 0.5)).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});

describe('clampPan', () => {
  const content = { width: 600, height: 900 };
  const box = { width: 1200, height: 900 };

  it('allows panning only over the overflow', () => {
    expect(clampPan({ zoom: 2, x: 999, y: -999 }, content, box)).toEqual({
      zoom: 2,
      x: 0,
      y: -450,
    });
  });

  it('centres content smaller than the box', () => {
    expect(clampPan({ zoom: 1, x: 30, y: 30 }, content, box)).toEqual({ zoom: 1, x: 0, y: 0 });
  });
});
