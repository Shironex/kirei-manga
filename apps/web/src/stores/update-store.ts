import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  createLogger,
  DEFAULT_UPDATE_CHANNEL,
  type UpdateChannel,
  type UpdateDownloadProgress,
  type UpdateInfo,
  type UpdateStatus,
} from '@kireimanga/shared';

const logger = createLogger('UpdateStore');

function isValidChannel(value: unknown): value is UpdateChannel {
  return value === 'stable' || value === 'beta';
}

/**
 * Guarded call-through to `window.electronAPI.updater.*`. Returns `undefined`
 * when the renderer runs outside Electron (e.g. Vite dev in a plain browser).
 */
function callUpdaterAPI<T>(
  action: string,
  fn: (
    updater: NonNullable<NonNullable<typeof window.electronAPI>['updater']>
  ) => Promise<T> | undefined
): Promise<T | undefined> {
  const updater = window.electronAPI?.updater;
  if (!updater) {
    logger.warn('Updater API not available');
    return Promise.resolve(undefined);
  }
  return (fn(updater) ?? Promise.resolve(undefined))?.catch((err: Error) => {
    logger.error(`Failed to ${action}:`, err.message);
    return undefined;
  });
}

interface UpdateState {
  status: UpdateStatus;
  updateInfo: UpdateInfo | null;
  progress: UpdateDownloadProgress | null;
  error: string | null;
  channel: UpdateChannel;
  isChannelSwitching: boolean;
}

interface UpdateActions {
  checkForUpdates: () => void;
  startDownload: () => void;
  installNow: () => void;
  setChannel: (channel: UpdateChannel) => void;
  initListeners: () => () => void;
}

type UpdateStore = UpdateState & UpdateActions;

export const useUpdateStore = create<UpdateStore>()(
  devtools(
    (set, get) => ({
      status: 'idle',
      updateInfo: null,
      progress: null,
      error: null,
      channel: DEFAULT_UPDATE_CHANNEL,
      isChannelSwitching: false,

      checkForUpdates: () => {
        set({ status: 'checking', error: null }, undefined, 'update/checkStart');
        callUpdaterAPI('check for updates', updater =>
          updater.checkForUpdates().then(result => {
            if (!result.enabled) {
              logger.info('Auto-updater disabled (dev mode)');
              set({ status: 'idle', error: null }, undefined, 'update/notEnabled');
            }
            return result;
          })
        ).catch((err: Error) => {
          set({ status: 'error', error: err.message }, undefined, 'update/checkError');
        });
      },

      startDownload: () => {
        set(
          { status: 'downloading', progress: null, error: null },
          undefined,
          'update/downloadStart'
        );
        callUpdaterAPI('start download', updater => updater.startDownload()).catch((err: Error) => {
          set({ status: 'error', error: err.message }, undefined, 'update/downloadError');
        });
      },

      installNow: () => {
        callUpdaterAPI('install update', updater => updater.installNow());
      },

      setChannel: (channel: UpdateChannel) => {
        set({ isChannelSwitching: true, channel }, undefined, 'update/setChannelStart');
        callUpdaterAPI('set update channel', u =>
          u.setChannel(channel).then(result => {
            const newChannel = isValidChannel(result) ? result : DEFAULT_UPDATE_CHANNEL;
            set(
              {
                channel: newChannel,
                isChannelSwitching: false,
                status: 'idle',
                updateInfo: null,
                progress: null,
                error: null,
              },
              undefined,
              'update/setChannelSuccess'
            );
            u.checkForUpdates().catch((err: Error) => {
              logger.error('Re-check after channel switch failed:', err);
            });
            return result;
          })
        ).catch((err: Error) => {
          set(
            { isChannelSwitching: false, status: 'error', error: err.message },
            undefined,
            'update/setChannelError'
          );
        });
      },

      initListeners: () => {
        const updater = window.electronAPI?.updater;
        if (!updater) {
          logger.warn('Updater API not available — skipping listener init');
          return () => {};
        }

        logger.debug('Initializing updater listeners');

        updater
          .getChannel()
          .then(ch => {
            const validated = isValidChannel(ch) ? ch : DEFAULT_UPDATE_CHANNEL;
            set({ channel: validated }, undefined, 'update/initialChannel');
          })
          .catch((err: Error) => {
            logger.error('Failed to fetch initial channel:', err);
          });

        const unsubChecking = updater.onCheckingForUpdate(() => {
          set({ status: 'checking', error: null }, undefined, 'update/checking');
        });
        const unsubAvailable = updater.onUpdateAvailable(info => {
          set(
            { status: 'available', updateInfo: info, error: null },
            undefined,
            'update/available'
          );
        });
        const unsubNotAvailable = updater.onUpdateNotAvailable(() => {
          set({ status: 'idle', error: null }, undefined, 'update/notAvailable');
        });
        const unsubProgress = updater.onDownloadProgress(progress => {
          set({ status: 'downloading', progress }, undefined, 'update/progress');
        });
        const unsubDownloaded = updater.onUpdateDownloaded(info => {
          set(
            { status: 'ready', updateInfo: info, progress: null },
            undefined,
            'update/downloaded'
          );
        });
        const unsubError = updater.onUpdateError(message => {
          set({ status: 'error', error: message }, undefined, 'update/error');
        });
        const unsubChannelChanged = updater.onChannelChanged(newChannel => {
          const validated = isValidChannel(newChannel) ? newChannel : DEFAULT_UPDATE_CHANNEL;
          // Skip echoes of a local switch we already handled.
          if (get().channel === validated && !get().error) return;
          set(
            {
              channel: validated,
              status: 'idle',
              updateInfo: null,
              progress: null,
              error: null,
            },
            undefined,
            'update/channelChanged'
          );
          updater.checkForUpdates().catch((err: Error) => {
            logger.error('Re-check after external channel switch failed:', err);
          });
        });

        return () => {
          logger.debug('Cleaning up updater listeners');
          unsubChecking();
          unsubAvailable();
          unsubNotAvailable();
          unsubProgress();
          unsubDownloaded();
          unsubError();
          unsubChannelChanged();
        };
      },
    }),
    { name: 'update' }
  )
);
