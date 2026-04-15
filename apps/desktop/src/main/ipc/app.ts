import { ipcMain, app, shell } from 'electron';
import { getLogsDir, createMainLogger } from '../logger';
import { getBackendPort } from '../backend-port';

const logger = createMainLogger('IPC:App');

const ALLOWED_PATH_NAMES = new Set([
  'userData',
  'home',
  'documents',
  'downloads',
  'desktop',
  'logs',
  'temp',
]);

/**
 * Register app-related IPC handlers
 */
export function registerAppHandlers(): void {
  ipcMain.handle('app:get-path', (_event, name: Parameters<typeof app.getPath>[0]) => {
    if (!ALLOWED_PATH_NAMES.has(name)) {
      logger.warn(`[security] Blocked app:get-path for non-whitelisted name: "${name}"`);
      return undefined;
    }
    return app.getPath(name);
  });

  ipcMain.handle('app:get-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('app:get-backend-port', () => {
    return getBackendPort();
  });

  ipcMain.handle('app:open-logs-folder', async () => {
    const logsPath = getLogsDir();
    await shell.openPath(logsPath);
  });
}

export function cleanupAppHandlers(): void {
  ipcMain.removeHandler('app:get-path');
  ipcMain.removeHandler('app:get-version');
  ipcMain.removeHandler('app:get-backend-port');
  ipcMain.removeHandler('app:open-logs-folder');
}
