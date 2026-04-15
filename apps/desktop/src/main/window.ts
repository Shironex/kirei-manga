import { app, BrowserWindow, Menu, shell, session } from 'electron';
import * as path from 'path';
import { registerIpcHandlers } from './ipc/register';
import { VITE_DEV_PORT } from '@kireimanga/shared';
import { logger } from './logger';
import { getBackendPort } from './backend-port';

/**
 * Set Content Security Policy for the renderer process.
 */
function setupContentSecurityPolicy(isDev: boolean, backendPort: number): void {
  const urlFilter = isDev
    ? { urls: [`http://localhost:${VITE_DEV_PORT}/*`] }
    : { urls: ['file://*'] };

  session.defaultSession.webRequest.onHeadersReceived(urlFilter, (details, callback) => {
    const cspDirectives = [
      isDev
        ? `script-src 'self' http://localhost:${VITE_DEV_PORT} 'unsafe-inline' 'unsafe-eval'`
        : "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      // Allow local custom protocols for covers and chapter pages (phase 7)
      "img-src 'self' data: blob: kirei-cover: kirei-page: https: http:",
      "font-src 'self' data:",
      isDev
        ? `connect-src 'self' http://localhost:${VITE_DEV_PORT} ws://localhost:${VITE_DEV_PORT} http://localhost:${backendPort} ws://localhost:${backendPort} http://127.0.0.1:${backendPort} ws://127.0.0.1:${backendPort} https://api.mangadex.org https://uploads.mangadex.org`
        : `connect-src 'self' http://localhost:${backendPort} ws://localhost:${backendPort} http://127.0.0.1:${backendPort} ws://127.0.0.1:${backendPort} https://api.mangadex.org https://uploads.mangadex.org`,
      "object-src 'none'",
      "media-src 'self' https: blob:",
      "default-src 'self'",
      "form-action 'self'",
      "base-uri 'self'",
    ];

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspDirectives.join('; ')],
      },
    });
  });
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

export function isExternalUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function createMainWindow(): Promise<BrowserWindow> {
  const isDev = process.env.NODE_ENV === 'development';

  setupContentSecurityPolicy(isDev, getBackendPort());

  const allowedPermissions = new Set(['clipboard-read', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return allowedPermissions.has(permission);
  });

  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
      ])
    );
  } else {
    Menu.setApplicationMenu(null);
  }

  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    title: 'KireiManga',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  registerIpcHandlers(mainWindow);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrlAllowed(url)) {
      logger.info(`[security] Opening external URL in system browser: ${url}`);
      shell.openExternal(url);
    } else {
      logger.warn(`[security] Blocked disallowed protocol: ${url}`);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowedOrigins = isDev ? [`http://localhost:${VITE_DEV_PORT}`] : ['file://'];
    const isAllowed = allowedOrigins.some(origin => url.startsWith(origin));
    if (!isAllowed) {
      event.preventDefault();
      if (isExternalUrlAllowed(url)) {
        shell.openExternal(url);
      }
    }
  });

  if (isDev) {
    logger.info('Running in development mode — loading Vite dev server');
    mainWindow.webContents.openDevTools();
    mainWindow.loadURL(`http://localhost:${VITE_DEV_PORT}`).catch(err => {
      logger.error('Failed to load Vite dev server:', err.message);
    });
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html');
    logger.info('Running in production mode — loading:', indexPath);
    mainWindow.loadFile(indexPath).catch(err => {
      logger.error('Failed to load renderer:', err);
    });
  }

  return mainWindow;
}
