import { app, BrowserWindow, protocol } from 'electron';
import { NestFactory } from '@nestjs/core';
import { registerProtocols, setMangaDexClient } from './protocols';
import { MangaDexClient } from '../modules/mangadex';
import { type INestApplication } from '@nestjs/common';
import { CustomIoAdapter, NestLoggerAdapter, corsOriginCallback } from '../modules/shared';
import { AppModule } from '../modules/app.module';
import { createMainWindow } from './window';
import { cleanupIpcHandlers } from './ipc/register';
import { logger, getLogPath, flushLogs } from './logger';
import { initializeAutoUpdater } from './updater';
import { LOCALHOST, APP_ID } from '@kireimanga/shared';
import { setBackendPort } from './backend-port';
import { safeCleanup } from './cleanup-utils';

// Register custom protocol schemes before app.ready so they gain standard /
// secure / streaming privileges in the renderer.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kirei-cover',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
      stream: true,
    },
  },
  {
    scheme: 'kirei-page',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
      stream: true,
    },
  },
]);

// Pin the Windows AppUserModelID so toast notifications and shortcut pinning
// resolve to the installer-registered Start Menu entry (see electron-builder.json "appId").
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

if (process.env.ELECTRON_USER_DATA_DIR) {
  app.setPath('userData', process.env.ELECTRON_USER_DATA_DIR);
}

export let mainWindow: BrowserWindow | null = null;
let nestApp: INestApplication | null = null;
let isShuttingDown = false;
let cleanupDone = false;

function showMainWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) {
    win.restore();
  }
  win.show();
  win.focus();
}

async function bootstrapNestApp(): Promise<void> {
  logger.info('Creating NestJS application...');
  nestApp = await NestFactory.create(AppModule, {
    logger: new NestLoggerAdapter(),
    bufferLogs: true,
  });
  nestApp.flushLogs();
  logger.info('NestJS application created');

  nestApp.useWebSocketAdapter(new CustomIoAdapter(nestApp));

  nestApp.enableCors({
    origin: corsOriginCallback,
    credentials: true,
  });

  logger.info('Starting to listen on dynamic port...');
  await nestApp.listen(0, LOCALHOST);
  const addr = nestApp.getHttpServer().address();
  if (!addr || typeof addr === 'string') {
    throw new Error(`Failed to get server port: address() returned ${JSON.stringify(addr)}`);
  }
  const port = addr.port;
  if (!port || port === 0) {
    throw new Error('OS assigned port 0 — server did not bind successfully');
  }
  setBackendPort(port);
  logger.info(`NestJS server running on port ${port}`);
  logger.info('Log file location:', getLogPath());
}

async function shutdownNestApp(): Promise<void> {
  if (nestApp) {
    logger.info('Shutting down NestJS...');
    await nestApp.close();
    nestApp = null;
    logger.info('NestJS shutdown complete');
  }
}

function setupWindowDependentServices(win: BrowserWindow): void {
  initializeAutoUpdater(win, process.env.NODE_ENV === 'development');

  win.on('close', event => {
    if (process.platform === 'darwin' && !isShuttingDown) {
      event.preventDefault();
      win.hide();
    } else if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

async function bootstrap(): Promise<void> {
  const isPackaged = app.isPackaged;
  logger.info(`[security] App packaged: ${isPackaged}`);

  await bootstrapNestApp();

  // Wire the MangaDex client into the cover + page protocol proxies before
  // registering protocols so the first render never hits a 503.
  if (nestApp) {
    try {
      const mangadexClient = nestApp.get(MangaDexClient);
      setMangaDexClient(mangadexClient);
    } catch (error) {
      logger.error('Failed to resolve MangaDexClient for kirei protocols:', error);
    }
  }

  registerProtocols();

  mainWindow = await createMainWindow();
  setupWindowDependentServices(mainWindow);
}

process.on('uncaughtException', error => {
  logger.error('Uncaught exception:', error);
});

process.on('unhandledRejection', reason => {
  logger.error('Unhandled rejection:', reason);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (isShuttingDown) return;
    logger.info(`Received ${signal}, initiating graceful shutdown...`);
    app.quit();
  });
}

app
  .whenReady()
  .then(bootstrap)
  .catch(error => {
    logger.error('Failed to bootstrap application:', error);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  logger.info('App activated');
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow(mainWindow);
    return;
  }

  cleanupIpcHandlers();
  mainWindow = await createMainWindow();
  setupWindowDependentServices(mainWindow);
  showMainWindow(mainWindow);
});

app.on('before-quit', event => {
  mainWindow = null;

  if (cleanupDone) return;
  event.preventDefault();
  if (isShuttingDown) return;

  isShuttingDown = true;

  (async () => {
    await safeCleanup('log flush', () => flushLogs(), logger);
    if (nestApp) {
      await shutdownNestApp();
    }
  })().finally(() => {
    cleanupDone = true;
    app.quit();
  });
});
