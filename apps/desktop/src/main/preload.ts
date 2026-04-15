import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { UpdateInfo, UpdateDownloadProgress, UpdateChannel } from '@kireimanga/shared';

/**
 * Create a typed IPC listener that returns an unsubscribe function.
 */
function createIpcListener<T>(channel: string): (callback: (data: T) => void) => () => void {
  return (callback: (data: T) => void) => {
    const handler = (_event: IpcRendererEvent, data: T) => callback(data);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };
}

/**
 * Channels allowed for generic IPC helpers. Restricts the surface exposed
 * via contextBridge so renderer code cannot invoke arbitrary handlers.
 *
 * Only app:*, window:*, and updater:* are allowlisted for v0.1.
 */
const ALLOWED_IPC_CHANNELS = new Set([
  'window:is-maximized',
  'app:get-version',
  'app:get-backend-port',
  'app:get-path',
  'app:open-logs-folder',
  'updater:check-for-updates',
  'updater:start-download',
  'updater:install-now',
  'updater:get-channel',
  'updater:set-channel',
]);

function assertAllowedChannel(channel: string): void {
  if (!ALLOWED_IPC_CHANNELS.has(channel)) {
    throw new Error(`IPC channel not allowed: "${channel}"`);
  }
}

function invokeWithTimeout<T>(channel: string, timeout: number, ...args: unknown[]): Promise<T> {
  assertAllowedChannel(channel);
  const invokePromise = ipcRenderer.invoke(channel, ...args) as Promise<T>;
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`IPC timeout: "${channel}" did not respond within ${timeout}ms`));
      invokePromise.catch(() => {});
    }, timeout);
    if (typeof timer === 'object' && 'unref' in timer) {
      timer.unref();
    }
  });
  return Promise.race([invokePromise.finally(() => clearTimeout(timer)), timeoutPromise]);
}

export interface ElectronAPI {
  window: {
    minimize: () => void;
    maximize: () => void;
    close: () => void;
    isMaximized: () => Promise<boolean>;
    onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
  };
  app: {
    getPath: (name: string) => Promise<string | undefined>;
    getVersion: () => Promise<string>;
    getBackendPort: () => Promise<number>;
    openLogsFolder: () => Promise<void>;
  };
  updater: {
    checkForUpdates: () => Promise<{ enabled: boolean; channel: UpdateChannel }>;
    startDownload: () => Promise<void>;
    installNow: () => Promise<void>;
    getChannel: () => Promise<UpdateChannel>;
    setChannel: (channel: UpdateChannel) => Promise<UpdateChannel>;
    onCheckingForUpdate: (callback: () => void) => () => void;
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => () => void;
    onUpdateNotAvailable: (callback: (info: UpdateInfo) => void) => () => void;
    onDownloadProgress: (callback: (progress: UpdateDownloadProgress) => void) => () => void;
    onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
    onUpdateError: (callback: (message: string) => void) => () => void;
    onChannelChanged: (callback: (channel: UpdateChannel) => void) => () => void;
  };
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) => Promise<T>;
  };
  platform: NodeJS.Platform;
}

const electronAPI: ElectronAPI = {
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    onMaximizedChange: createIpcListener<boolean>('window:maximized-change'),
  },
  app: {
    getPath: (name: string) =>
      ipcRenderer.invoke('app:get-path', name) as Promise<string | undefined>,
    getVersion: () => ipcRenderer.invoke('app:get-version'),
    getBackendPort: () => ipcRenderer.invoke('app:get-backend-port') as Promise<number>,
    openLogsFolder: () => ipcRenderer.invoke('app:open-logs-folder') as Promise<void>,
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('updater:check-for-updates'),
    startDownload: () => ipcRenderer.invoke('updater:start-download'),
    installNow: () => ipcRenderer.invoke('updater:install-now'),
    getChannel: () => ipcRenderer.invoke('updater:get-channel'),
    setChannel: (channel: UpdateChannel) => ipcRenderer.invoke('updater:set-channel', channel),
    onCheckingForUpdate: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on('updater:checking-for-update', listener);
      return () => {
        ipcRenderer.removeListener('updater:checking-for-update', listener);
      };
    },
    onUpdateAvailable: createIpcListener<UpdateInfo>('updater:update-available'),
    onUpdateNotAvailable: createIpcListener<UpdateInfo>('updater:update-not-available'),
    onDownloadProgress: createIpcListener<UpdateDownloadProgress>('updater:download-progress'),
    onUpdateDownloaded: createIpcListener<UpdateInfo>('updater:update-downloaded'),
    onUpdateError: createIpcListener<string>('updater:error'),
    onChannelChanged: createIpcListener<UpdateChannel>('updater:channel-changed'),
  },
  ipc: {
    invokeWithTimeout: <T>(channel: string, timeout: number, ...args: unknown[]) =>
      invokeWithTimeout<T>(channel, timeout, ...args),
  },
  platform: process.platform,
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
