import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as semver from 'semver';
import { UPDATE_ERROR_RELEASE_PENDING, DEFAULT_UPDATE_CHANNEL } from '@kireimanga/shared';
import type { UpdateChannel } from '@kireimanga/shared';
import type { UpdateInfo as ElectronUpdateInfo } from 'electron-updater';
import type { ProgressInfo } from 'electron-updater';
import { store } from './store';
import { createMainLogger } from './logger';

const logger = createMainLogger('AutoUpdater');

let updaterEnabled = false;
let currentChannel: UpdateChannel = DEFAULT_UPDATE_CHANNEL;
let updaterInitialized = false;
let mainWindowRef: BrowserWindow | null = null;

// Disable auto download — user controls when to download
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function parseReleaseNotes(releaseNotes: ElectronUpdateInfo['releaseNotes']): string | null {
  if (!releaseNotes) return null;
  if (typeof releaseNotes === 'string') return releaseNotes;
  // Array of ReleaseNoteInfo — join all notes
  return releaseNotes
    .map(entry => entry.note)
    .filter(Boolean)
    .join('\n\n');
}

/** Safely send IPC to the main window (guards against destroyed windows) */
function sendToMainWindow(channel: string, ...args: unknown[]): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, ...args);
  }
}

function getPersistedChannel(): UpdateChannel {
  const stored = store.get('preferences.updateChannel') as string | undefined;
  if (stored === 'stable' || stored === 'beta') return stored;
  return DEFAULT_UPDATE_CHANNEL;
}

function applyChannel(channel: UpdateChannel): void {
  currentChannel = channel;
  autoUpdater.channel = channel === 'beta' ? 'beta' : 'latest';
  autoUpdater.allowPrerelease = channel === 'beta';
  autoUpdater.allowDowngrade = true;
  logger.info(`Update channel set to '${channel}' (autoUpdater.channel='${autoUpdater.channel}')`);
}

export function getUpdateChannel(): UpdateChannel {
  return currentChannel;
}

export async function setUpdateChannel(channel: UpdateChannel): Promise<UpdateChannel> {
  logger.info(`Switching update channel: ${currentChannel} → ${channel}`);
  store.set('preferences.updateChannel', channel);
  applyChannel(channel);
  return channel;
}

export function initializeAutoUpdater(mainWindow: BrowserWindow, isDev: boolean): void {
  // Always update the window reference so existing listeners target the new window
  mainWindowRef = mainWindow;

  if (isDev) {
    logger.info('Skipping auto-updater in development mode');
    updaterEnabled = false;
    return;
  }

  if (process.platform === 'darwin') {
    logger.info(
      'Auto-updater disabled on macOS (unsigned app — users should download updates from GitHub Releases)'
    );
    updaterEnabled = false;
    return;
  }

  updaterEnabled = true;
  applyChannel(getPersistedChannel());

  // Only register listeners and timers once; subsequent calls just update mainWindowRef
  if (updaterInitialized) return;
  updaterInitialized = true;

  // Wire autoUpdater events → renderer via IPC (closures read mainWindowRef)
  autoUpdater.on('checking-for-update', () => {
    logger.info('Checking for update...');
    sendToMainWindow('updater:checking-for-update');
  });

  autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
    logger.info('Update available:', info.version);
    let isDowngrade = false;
    try {
      isDowngrade = semver.lt(info.version, app.getVersion());
    } catch {
      logger.warn(`Could not compare versions: ${info.version} vs ${app.getVersion()}`);
    }
    sendToMainWindow('updater:update-available', {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
      channel: currentChannel,
      isDowngrade,
    });
  });

  autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
    logger.info('No update available. Current version is up to date:', info.version);
    sendToMainWindow('updater:update-not-available', {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    logger.debug(
      `Download progress: ${progress.percent.toFixed(1)}% (${progress.bytesPerSecond} B/s)`
    );
    sendToMainWindow('updater:download-progress', {
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    });
  });

  autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
    logger.info('Update downloaded:', info.version);
    sendToMainWindow('updater:update-downloaded', {
      version: info.version,
      releaseNotes: parseReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('error', (error: Error) => {
    // Detect 404 on any update yml file (latest.yml, beta.yml, alpha.yml, etc.)
    // We check both filenames to handle race conditions when the channel changes
    // mid-check, and also when stable checks hit a beta-only release tag.
    const isReleasePending =
      /Cannot find (latest|beta)\.yml/.test(error.message) ||
      (error.message.includes('.yml') && error.message.includes('404'));

    if (isReleasePending) {
      logger.warn(
        'Release artifacts not yet available (.yml 404) — build may still be in progress'
      );
      sendToMainWindow('updater:error', UPDATE_ERROR_RELEASE_PENDING);
    } else {
      logger.error('Auto-updater error:', error.message);
      sendToMainWindow('updater:error', error.message);
    }
  });

  // Initial check after a short delay to let the app finish loading
  setTimeout(() => {
    checkForUpdates();
  }, 5000);

  // Periodic checks every hour
  setInterval(
    () => {
      checkForUpdates();
    },
    60 * 60 * 1000
  );
}

export async function checkForUpdates(): Promise<{ enabled: boolean; channel: UpdateChannel }> {
  const channel = currentChannel;
  if (!updaterEnabled) {
    logger.info('Update check skipped — updater not enabled');
    return { enabled: false, channel };
  }
  try {
    logger.info(`Triggering update check on '${channel}' channel...`);
    await autoUpdater.checkForUpdates();
  } catch (error) {
    logger.error('Failed to check for updates:', error);
  }
  return { enabled: true, channel };
}

export async function downloadUpdate(): Promise<void> {
  logger.info('Starting update download...');
  await autoUpdater.downloadUpdate();
}

export function quitAndInstall(): void {
  logger.info('Quitting and installing update...');
  autoUpdater.quitAndInstall();
}
