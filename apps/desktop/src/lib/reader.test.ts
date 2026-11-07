import { describe, expect, it } from 'vitest';

import { formatBytes, stepPage } from './reader';

describe('stepPage', () => {
  it('moves forward and backward inside the source', () => {
    expect(stepPage(3, 1, 10)).toEqual({ index: 4, direction: 'forward' });
    expect(stepPage(3, -1, 10)).toEqual({ index: 2, direction: 'backward' });
  });

  it('clamps at both ends', () => {
    expect(stepPage(9, 1, 10).index).toBe(9);
    expect(stepPage(0, -1, 10).index).toBe(0);
    expect(stepPage(0, 1, 0).index).toBe(0);
  });
});

describe('formatBytes', () => {
  it('picks a readable unit', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(300 * 1024)).toBe('300 KiB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MiB');
  });
});
