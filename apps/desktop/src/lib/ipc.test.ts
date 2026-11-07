import { describe, expect, it } from 'vitest';

import { describeAppInfo, isTauri } from './ipc';

describe('ipc', () => {
  it('formats the app info returned by the backend', () => {
    expect(describeAppInfo({ name: 'KireiManga', version: '0.3.0', os: 'macos' })).toBe(
      'KireiManga 0.3.0 on macos'
    );
  });

  it('reports no Tauri runtime outside the webview', () => {
    expect(isTauri()).toBe(false);
  });
});
