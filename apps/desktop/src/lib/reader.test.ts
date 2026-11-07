import { describe, expect, it, vi } from 'vitest';

import { deviceBox, formatBytes, pageUrl, stepPage } from './reader';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string, scheme: string) =>
    `${scheme}://localhost/${encodeURIComponent(path)}`,
  invoke: vi.fn(),
}));

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

describe('pageUrl', () => {
  it('keeps the revision out of the encoded path', () => {
    expect(pageUrl(3, 7)).toBe('kirei-page://localhost/3%2F7');
    expect(pageUrl(3, 7, 2)).toBe('kirei-page://localhost/3%2F7?r=2');
  });
});

describe('deviceBox', () => {
  it('scales CSS pixels by the device pixel ratio and rounds up', () => {
    expect(deviceBox(800, 600, 2)).toEqual({ maxWidth: 1600, maxHeight: 1200 });
    expect(deviceBox(801.5, 600.2, 1.25)).toEqual({ maxWidth: 1002, maxHeight: 751 });
  });

  it('never asks for an empty box', () => {
    expect(deviceBox(0, 0, 2)).toEqual({ maxWidth: 1, maxHeight: 1 });
    expect(deviceBox(100, 100, 0)).toEqual({ maxWidth: 100, maxHeight: 100 });
  });
});
