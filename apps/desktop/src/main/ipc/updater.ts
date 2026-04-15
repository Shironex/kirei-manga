import { BrowserWindow, ipcMain } from 'electron';
import type { UpdateChannel } from '@kireimanga/shared';
import { createMainLogger } from '../logger';
import {
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getUpdateChannel,
  setUpdateChannel,
} from '../updater';

const logger = createMainLogger('IPC:Updater');

export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check-for-updates', async () => {
    try {
      return await checkForUpdates();
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      throw error;
    }
  });

  ipcMain.handle('updater:start-download', async () => {
    try {
      await downloadUpdate();
    } catch (error) {
      logger.error('Failed to start download:', error);
      throw error;
    }
  });

  ipcMain.handle('updater:install-now', async () => {
    try {
      quitAndInstall();
    } catch (error) {
      logger.error('Failed to quit and install:', error);
      throw error;
    }
  });

  ipcMain.handle('updater:get-channel', () => {
    return getUpdateChannel();
  });

  ipcMain.handle('updater:set-channel', async (_event, channel: UpdateChannel) => {
    try {
      if (channel !== 'stable' && channel !== 'beta') {
        throw new Error(`Invalid update channel: ${String(channel)}`);
      }
      const result = await setUpdateChannel(channel);
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send('updater:channel-changed', result);
      }
      return result;
    } catch (error) {
      logger.error('Failed to set update channel:', error);
      throw error;
    }
  });
}

export function cleanupUpdaterHandlers(): void {
  ipcMain.removeHandler('updater:check-for-updates');
  ipcMain.removeHandler('updater:start-download');
  ipcMain.removeHandler('updater:install-now');
  ipcMain.removeHandler('updater:get-channel');
  ipcMain.removeHandler('updater:set-channel');
}
