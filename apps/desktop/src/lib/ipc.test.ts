import { describe, expect, it } from 'vitest';

import { call, describeAppInfo, getAppInfo, IpcError, isTauri } from './ipc';

describe('ipc', () => {
  it('formats the app info returned by the backend', () => {
    expect(describeAppInfo({ name: 'KireiManga', version: '0.3.0', os: 'macos' })).toBe(
      'KireiManga 0.3.0 on macos'
    );
  });

  it('reports no Tauri runtime outside the webview', () => {
    expect(isTauri()).toBe(false);
  });

  it('rejects with an IpcError naming the command when there is no backend', async () => {
    await expect(getAppInfo()).rejects.toBeInstanceOf(IpcError);
    await expect(call('app_info')).rejects.toMatchObject({
      name: 'IpcError',
      command: 'app_info',
    });
  });
});
